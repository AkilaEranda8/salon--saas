"""AI Provider Adapter — single interface for OpenAI / Gemini / etc."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class CompletionRequest:
    messages: list[dict[str, str]]
    model: str | None = None
    temperature: float = 0.35
    max_tokens: int = 512
    api_key: str | None = None


@dataclass
class CompletionResult:
    text: str
    provider: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: int = 0
    raw: dict[str, Any] = field(default_factory=dict)


class LLMProvider(Protocol):
    name: str

    async def complete(self, req: CompletionRequest) -> CompletionResult: ...


def get_provider(provider: str) -> LLMProvider:
    # Lazy imports avoid circular import with openai/gemini modules.
    key = (provider or "openai").lower().strip()
    if key == "gemini":
        from .gemini_provider import GeminiProvider
        return GeminiProvider()
    if key in ("openai", "nvidia"):
        from .openai_provider import OpenAIProvider
        # nvidia uses OpenAI-compatible API; base_url set by caller via env later
        return OpenAIProvider(name=key)
    raise ValueError(f"Unsupported provider: {provider}")
