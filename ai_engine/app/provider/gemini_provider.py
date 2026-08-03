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

        parts: list[str] = []
        for m in req.messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            parts.append(f"{role.upper()}: {content}")
        prompt = "\n\n".join(parts)

        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": req.temperature,
                "maxOutputTokens": min(int(req.max_tokens or 512), 512),
            },
        }

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
