"""
RC7 — end-to-end turn observability (no secrets / minimal PII).

Trace IDs correlate AI engine actions with CRM inbound turns.
Never log API keys or full phone numbers.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Optional


def new_trace_id() -> str:
    return f"t28-{uuid.uuid4().hex[:16]}"


def redact_phone(phone: Optional[str]) -> Optional[str]:
    digits = "".join(c for c in str(phone or "") if c.isdigit())
    if len(digits) < 4:
        return None
    return f"***{digits[-4:]}"


@dataclass
class TraceEvent:
    name: str
    ok: bool = True
    ms: Optional[float] = None
    detail: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        # Strip accidental secret-looking keys
        for k in list(d.get("detail") or {}):
            lk = str(k).lower()
            if any(x in lk for x in ("api_key", "password", "secret", "token", "authorization")):
                d["detail"].pop(k, None)
        return d


@dataclass
class TurnTrace:
    trace_id: str
    tenant_id: Optional[int] = None
    conversation_id: Optional[int] = None
    phone_redacted: Optional[str] = None
    started_ms: float = field(default_factory=lambda: time.time() * 1000)
    events: list[TraceEvent] = field(default_factory=list)
    gemini_latency_ms: Optional[float] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    provider: Optional[str] = None
    model: Optional[str] = None

    def span(self, name: str) -> "_Span":
        return _Span(self, name)

    def add(
        self,
        name: str,
        *,
        ok: bool = True,
        ms: Optional[float] = None,
        **detail: Any,
    ) -> None:
        self.events.append(TraceEvent(name=name, ok=ok, ms=ms, detail=dict(detail)))

    def record_usage(
        self,
        *,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        prompt_tokens: Optional[int] = None,
        completion_tokens: Optional[int] = None,
        latency_ms: Optional[float] = None,
    ) -> None:
        self.provider = provider or self.provider
        self.model = model or self.model
        self.prompt_tokens = prompt_tokens if prompt_tokens is not None else self.prompt_tokens
        self.completion_tokens = (
            completion_tokens if completion_tokens is not None else self.completion_tokens
        )
        self.gemini_latency_ms = latency_ms if latency_ms is not None else self.gemini_latency_ms
        self.add(
            "provider_usage",
            ok=True,
            ms=latency_ms,
            provider=provider,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )

    def to_action(self) -> dict[str, Any]:
        elapsed = (time.time() * 1000) - self.started_ms
        return {
            "tool": "turn_trace",
            "ok": True,
            "trace_id": self.trace_id,
            "tenant_id": self.tenant_id,
            "conversation_id": self.conversation_id,
            "phone": self.phone_redacted,
            "elapsed_ms": round(elapsed, 1),
            "gemini_latency_ms": self.gemini_latency_ms,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "provider": self.provider,
            "model": self.model,
            "events": [e.to_dict() for e in self.events[-40:]],
        }


class _Span:
    def __init__(self, trace: TurnTrace, name: str):
        self.trace = trace
        self.name = name
        self.t0 = time.time() * 1000
        self._ok = True
        self._detail: dict[str, Any] = {}

    def __enter__(self) -> "_Span":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        ms = (time.time() * 1000) - self.t0
        ok = self._ok and exc_type is None
        detail = dict(self._detail)
        if exc is not None:
            detail["error"] = str(exc)[:160]
        self.trace.add(self.name, ok=ok, ms=round(ms, 1), **detail)

    def detail(self, **kwargs: Any) -> None:
        self._detail.update(kwargs)

    def fail(self, **kwargs: Any) -> None:
        self._ok = False
        self._detail.update(kwargs)
