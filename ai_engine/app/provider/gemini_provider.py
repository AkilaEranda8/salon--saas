"""Google Gemini provider — free-tier friendly with 429/503 model fallback + Google Search grounding."""
from __future__ import annotations

import asyncio
import time

import httpx

from .base import CompletionRequest, CompletionResult

# Prefer fast lite models first for WhatsApp reply latency.
FREE_TIER_MODELS = (
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
)

# Models known to support Grounding with Google Search well
GOOGLE_SEARCH_MODELS = (
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash-lite",
)


MAX_OUTPUT_TOKENS = 1024  # floor/default; replies stay short via prompt, but 512 truncated Sinhala/Tamil
MAX_OUTPUT_TOKENS_CAP = 2048
RETRYABLE_STATUS = {429, 404, 503}
PER_MODEL_RETRIES = 1  # fail over models quickly — Google 503/hangs must not block the chat
RETRY_SLEEP_SEC = 0.2
# Fast WhatsApp replies — hang/timeout must not leave customers waiting
HTTP_TIMEOUT_SEC = 8.0
HTTP_TIMEOUT_SEARCH_SEC = 18.0  # Google grounding can be slow; train path needs headroom
HTTP_TIMEOUT_VISION_SEC = 20.0
HTTP_TIMEOUT_AUDIO_SEC = 45.0


def _max_output_tokens(requested: int | None) -> int:
    return max(MAX_OUTPUT_TOKENS, min(int(requested or 0), MAX_OUTPUT_TOKENS_CAP))


def _message_has_images(m: dict) -> bool:
    imgs = m.get("images") or []
    return bool(isinstance(imgs, list) and imgs)


def _gemini_parts(m: dict) -> list[dict]:
    """Text + optional inline images for Gemini multimodal."""
    text = str(m.get("content") or "").strip()
    parts: list[dict] = []
    if text:
        parts.append({"text": text})
    for img in m.get("images") or []:
        if not isinstance(img, dict):
            continue
        raw = str(img.get("dataBase64") or img.get("data") or "").strip()
        mime = str(img.get("mimeType") or img.get("mime_type") or "image/jpeg").strip()
        if not raw:
            continue
        # Strip data-URL prefix if present
        if "," in raw and raw.lower().startswith("data:"):
            raw = raw.split(",", 1)[1]
        parts.append({"inline_data": {"mime_type": mime, "data": raw}})
    return parts


def _build_contents(messages: list[dict]) -> tuple[str, list[dict]]:
    """
    Split OpenAI-style messages into Gemini `systemInstruction` text + `contents`.
    system → systemInstruction (kept as a system role, not flattened into the prompt);
    user → "user"; assistant/other → "model". Consecutive same-role text turns are merged;
    image turns are never merged. Conversation starts with a user turn.
    """
    system_parts: list[str] = []
    contents: list[dict] = []
    for m in messages:
        role = str(m.get("role") or "user").lower()
        if role == "system":
            text = str(m.get("content") or "").strip()
            if text:
                system_parts.append(text)
            continue
        parts = _gemini_parts(m)
        if not parts:
            continue
        g_role = "user" if role in ("user", "customer") else "model"
        # Don't merge when either side has images (inline_data must stay intact)
        can_merge = (
            contents
            and contents[-1]["role"] == g_role
            and not _message_has_images(m)
            and all("text" in p for p in contents[-1]["parts"])
        )
        if can_merge and "text" in parts[0]:
            contents[-1]["parts"][0]["text"] += "\n\n" + parts[0]["text"]
            contents[-1]["parts"].extend(parts[1:])
        else:
            contents.append({"role": g_role, "parts": parts})
    if contents and contents[0]["role"] == "model":
        contents.insert(0, {"role": "user", "parts": [{"text": "(earlier conversation)"}]})
    return "\n\n".join(system_parts), contents


class GeminiProvider:
    name = "gemini"

    async def complete(self, req: CompletionRequest) -> CompletionResult:
        if not req.api_key:
            raise ValueError("Gemini API key missing")

        use_search = bool(getattr(req, "google_search", False))
        preferred = (
            req.model or (GOOGLE_SEARCH_MODELS[0] if use_search else FREE_TIER_MODELS[0])
        ).strip()
        # Fast path: lite first. Search path: search-capable first, then lite.
        if use_search:
            ordered = (*GOOGLE_SEARCH_MODELS, preferred, *FREE_TIER_MODELS)
        else:
            # Prefer fast lite even if settings ask for a heavier flash model
            ordered = (FREE_TIER_MODELS[0], preferred, *FREE_TIER_MODELS)
        candidates: list[str] = []
        for m in ordered:
            if m and m not in candidates:
                candidates.append(m)

        system_instruction, contents = _build_contents(req.messages)
        if not contents:
            raise ValueError("Gemini request has no user/assistant content")

        inline_mimes = [
            str((p.get("inline_data") or {}).get("mime_type") or "")
            for c in contents
            for p in (c.get("parts") or [])
            if isinstance(p, dict) and "inline_data" in p
        ]
        has_audio = any(m.startswith("audio/") for m in inline_mimes)
        has_images = bool(inline_mimes) and not has_audio
        if has_audio:
            http_timeout = HTTP_TIMEOUT_AUDIO_SEC
        elif has_images:
            http_timeout = HTTP_TIMEOUT_VISION_SEC
        elif use_search:
            http_timeout = HTTP_TIMEOUT_SEARCH_SEC
        else:
            http_timeout = HTTP_TIMEOUT_SEC

        payload: dict = {
            "contents": contents,
            "generationConfig": {
                "temperature": req.temperature,
                "maxOutputTokens": _max_output_tokens(req.max_tokens),
            },
        }
        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        started = time.perf_counter()
        last_error = ""
        data: dict = {}
        model_name = preferred
        used_search_tool = False
        search_disabled = False  # after one search quota/fail, plain only

        # Keep candidate list short for WhatsApp latency
        candidates = candidates[:2]

        async with httpx.AsyncClient(timeout=http_timeout) as client:
            for idx, model_name in enumerate(candidates):
                url = (
                    "https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{model_name}:generateContent"
                )
                # At most ONE search attempt on the first model, then plain everywhere
                if use_search and idx == 0 and not search_disabled:
                    tool_variants: list[tuple[bool, list | None]] = [
                        (True, [{"googleSearch": {}}]),
                        (False, None),
                    ]
                else:
                    tool_variants = [(False, None)]
                got = False
                model_dead = False
                for with_tools, tools_val in tool_variants:
                    trial_payload = dict(payload)
                    if tools_val is not None:
                        trial_payload["tools"] = tools_val
                    else:
                        trial_payload.pop("tools", None)
                    for attempt in range(PER_MODEL_RETRIES):
                        try:
                            response = await client.post(
                                url,
                                params={"key": req.api_key},
                                json=trial_payload,
                            )
                        except Exception as exc:
                            last_error = f"Gemini request failed ({model_name}): {exc}"
                            if attempt + 1 < PER_MODEL_RETRIES:
                                await asyncio.sleep(RETRY_SLEEP_SEC)
                                continue
                            break
                        if response.status_code < 400:
                            data = response.json()
                            used_search_tool = with_tools
                            got = True
                            break
                        body_txt = response.text[:400]
                        last_error = f"Gemini API error {response.status_code}: {body_txt}"
                        # Dead / renamed model → next candidate
                        if response.status_code == 404 and (
                            "no longer available" in body_txt
                            or "not found" in body_txt.lower()
                            or "is not found" in body_txt.lower()
                        ):
                            model_dead = True
                            break
                        # Search tool rejected / quota → skip search for rest of turn
                        if with_tools and response.status_code in (400, 404, 429, 503):
                            search_disabled = True
                            break
                        if response.status_code in RETRYABLE_STATUS:
                            if attempt + 1 < PER_MODEL_RETRIES:
                                await asyncio.sleep(RETRY_SLEEP_SEC * (attempt + 1))
                                continue
                            break
                        raise ValueError(last_error)
                    if got or model_dead:
                        break
                if got:
                    break
            else:
                raise ValueError(last_error or "Gemini API failed for all free-tier models")

        if not data:
            raise ValueError(last_error or "Gemini API returned empty response")

        latency_ms = int((time.perf_counter() - started) * 1000)
        text = ""
        try:
            candidates_out = data.get("candidates") or []
            parts_out = (((candidates_out[0] or {}).get("content") or {}).get("parts") or [])
            text = "".join(p.get("text") or "" for p in parts_out).strip()
        except Exception:
            text = ""

        usage = data.get("usageMetadata") or {}
        prompt_tokens = int(usage.get("promptTokenCount") or 0)
        completion_tokens = int(usage.get("candidatesTokenCount") or 0)
        total_tokens = int(usage.get("totalTokenCount") or 0)
        if completion_tokens <= 0 and total_tokens > prompt_tokens:
            completion_tokens = total_tokens - prompt_tokens
        if total_tokens <= 0:
            total_tokens = prompt_tokens + completion_tokens

        grounding: dict = {"used_search_tool": used_search_tool}
        try:
            cand0 = (data.get("candidates") or [{}])[0] or {}
            gm = cand0.get("groundingMetadata") or {}
            if gm:
                grounding.update(
                    {
                        "webSearchQueries": gm.get("webSearchQueries") or [],
                        "chunks": len(gm.get("groundingChunks") or []),
                    }
                )
        except Exception:
            pass

        return CompletionResult(
            text=text,
            provider=self.name,
            model=model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=latency_ms,
            raw={"grounding": grounding},
        )
