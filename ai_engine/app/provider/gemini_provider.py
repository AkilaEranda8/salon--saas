"""Google Gemini provider — free-tier friendly with 429 model fallback."""
from __future__ import annotations

import time

import httpx

from .base import CompletionRequest, CompletionResult

# Prefer free-tier / high-RPM models first (Google AI Studio free quota).
FREE_TIER_MODELS = (
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-flash-latest",
)


MAX_OUTPUT_TOKENS = 1024  # floor/default; replies stay short via prompt, but 512 truncated Sinhala/Tamil
MAX_OUTPUT_TOKENS_CAP = 2048


def _max_output_tokens(requested: int | None) -> int:
    return max(MAX_OUTPUT_TOKENS, min(int(requested or 0), MAX_OUTPUT_TOKENS_CAP))


def _build_contents(messages: list[dict[str, str]]) -> tuple[str, list[dict]]:
    """
    Split OpenAI-style messages into Gemini `systemInstruction` text + `contents`.
    system → systemInstruction (kept as a system role, not flattened into the prompt);
    user → "user"; assistant/other → "model". Consecutive same-role turns are merged
    and the conversation is guaranteed to start with a user turn.
    """
    system_parts: list[str] = []
    contents: list[dict] = []
    for m in messages:
        role = str(m.get("role") or "user").lower()
        text = str(m.get("content") or "").strip()
        if not text:
            continue
        if role == "system":
            system_parts.append(text)
            continue
        g_role = "user" if role in ("user", "customer") else "model"
        if contents and contents[-1]["role"] == g_role:
            contents[-1]["parts"][0]["text"] += "\n\n" + text
        else:
            contents.append({"role": g_role, "parts": [{"text": text}]})
    if contents and contents[0]["role"] == "model":
        contents.insert(0, {"role": "user", "parts": [{"text": "(earlier conversation)"}]})
    return "\n\n".join(system_parts), contents


class GeminiProvider:
    name = "gemini"

    async def complete(self, req: CompletionRequest) -> CompletionResult:
        if not req.api_key:
            raise ValueError("Gemini API key missing")

        preferred = (req.model or FREE_TIER_MODELS[0]).strip()
        candidates: list[str] = []
        for m in (preferred, *FREE_TIER_MODELS):
            if m and m not in candidates:
                candidates.append(m)

        system_instruction, contents = _build_contents(req.messages)
        if not contents:
            raise ValueError("Gemini request has no user/assistant content")

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

        async with httpx.AsyncClient(timeout=60.0) as client:
            for model_name in candidates:
                url = (
                    "https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{model_name}:generateContent"
                )
                response = await client.post(
                    url,
                    params={"key": req.api_key},
                    json=payload,
                )
                if response.status_code < 400:
                    data = response.json()
                    break
                last_error = f"Gemini API error {response.status_code}: {response.text[:300]}"
                # Retry next free-tier model on quota / not-found / rate limit
                if response.status_code in (429, 404, 503):
                    continue
                raise ValueError(last_error)
            else:
                raise ValueError(last_error or "Gemini API failed for all free-tier models")

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

        return CompletionResult(
            text=text,
            provider=self.name,
            model=model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            latency_ms=latency_ms,
        )
