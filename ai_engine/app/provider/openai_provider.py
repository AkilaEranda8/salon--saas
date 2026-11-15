"""OpenAI (and OpenAI-compatible) provider."""
from __future__ import annotations

import os
import time
from typing import Any

from openai import AsyncOpenAI

from .base import CompletionRequest, CompletionResult


def _to_openai_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert engine messages (optional images) into OpenAI chat content parts."""
    out: list[dict[str, Any]] = []
    for m in messages:
        role = str(m.get("role") or "user").lower()
        if role in ("customer",):
            role = "user"
        elif role in ("ai", "agent"):
            role = "assistant"
        text = str(m.get("content") or "")
        images = m.get("images") or []
        if role == "system" or not images:
            out.append({"role": role if role in ("system", "user", "assistant") else "user", "content": text})
            continue
        parts: list[dict[str, Any]] = []
        if text.strip():
            parts.append({"type": "text", "text": text})
        for img in images:
            if not isinstance(img, dict):
                continue
            raw = str(img.get("dataBase64") or img.get("data") or "").strip()
            mime = str(img.get("mimeType") or img.get("mime_type") or "image/jpeg").strip()
            if not raw:
                continue
            if not raw.lower().startswith("data:"):
                raw = f"data:{mime};base64,{raw}"
            parts.append({"type": "image_url", "image_url": {"url": raw}})
        out.append({"role": "user", "content": parts or text})
    return out


class OpenAIProvider:
    name = "openai"

    def __init__(self, name: str = "openai", base_url: str | None = None):
        self.name = name
        self.base_url = base_url
        if name == "nvidia" and not base_url:
            self.base_url = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")

    async def complete(self, req: CompletionRequest) -> CompletionResult:
        if not req.api_key:
            raise ValueError("OpenAI API key missing")

        client = AsyncOpenAI(api_key=req.api_key, base_url=self.base_url, timeout=28.0)
        model = req.model or ("meta/llama-3.3-70b-instruct" if self.name == "nvidia" else "gpt-4o-mini")
        started = time.perf_counter()
        completion = await client.chat.completions.create(
            model=model,
            messages=_to_openai_messages(req.messages),
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        )
        latency_ms = int((time.perf_counter() - started) * 1000)
        choice = completion.choices[0].message.content or ""
        usage = completion.usage
        prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
        completion_tokens = getattr(usage, "completion_tokens", 0) or 0
        return CompletionResult(
            text=choice.strip(),
            provider=self.name,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            latency_ms=latency_ms,
        )
