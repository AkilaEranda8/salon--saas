"""Google Gemini provider — per-request HTTP client (no process-global API key)."""
from __future__ import annotations

import time

import httpx

from .base import CompletionRequest, CompletionResult


class GeminiProvider:
    name = "gemini"

    async def complete(self, req: CompletionRequest) -> CompletionResult:
        if not req.api_key:
            raise ValueError("Gemini API key missing")

        model_name = req.model or "gemini-2.0-flash"
        parts: list[str] = []
        for m in req.messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            parts.append(f"{role.upper()}: {content}")
        prompt = "\n\n".join(parts)

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model_name}:generateContent"
        )
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": req.temperature,
                "maxOutputTokens": req.max_tokens,
            },
        }

        started = time.perf_counter()
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                url,
                params={"key": req.api_key},
                json=payload,
            )
            if response.status_code >= 400:
                raise ValueError(f"Gemini API error {response.status_code}: {response.text[:300]}")
            data = response.json()

        latency_ms = int((time.perf_counter() - started) * 1000)
        text = ""
        try:
            candidates = data.get("candidates") or []
            parts_out = (((candidates[0] or {}).get("content") or {}).get("parts") or [])
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
