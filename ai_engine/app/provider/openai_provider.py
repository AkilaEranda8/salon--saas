"""OpenAI (and OpenAI-compatible) provider."""
from __future__ import annotations

import os
import time
from openai import AsyncOpenAI

from .base import CompletionRequest, CompletionResult


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

        client = AsyncOpenAI(api_key=req.api_key, base_url=self.base_url)
        model = req.model or ("meta/llama-3.3-70b-instruct" if self.name == "nvidia" else "gpt-4o-mini")
        started = time.perf_counter()
        completion = await client.chat.completions.create(
            model=model,
            messages=req.messages,
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
