"""Redis-backed booking session store — Redis REQUIRED (C12). No memory fallback."""
from __future__ import annotations

import json
import os
from typing import Any, Optional

_redis = None
TTL_SECONDS = int(os.getenv("BOOKING_SESSION_TTL_SECONDS", "86400"))


class BookingSessionUnavailable(RuntimeError):
    """Raised when Redis is required for booking state but unavailable."""


def _get_redis():
    global _redis
    if _redis is not None:
        return _redis if _redis is not False else None
    url = (os.getenv("REDIS_URL") or "").strip()
    if not url:
        _redis = False
        return None
    try:
        import redis  # type: ignore

        client = redis.from_url(url, decode_responses=True)
        client.ping()
        _redis = client
        return client
    except Exception as exc:
        print(f"[session_store] Redis unavailable: {exc}")
        _redis = False
        return None


def require_redis():
    r = _get_redis()
    if not r:
        raise BookingSessionUnavailable(
            "Booking dialogue unavailable: Redis session store is required."
        )
    return r


def redis_key(session_key: str) -> str:
    return f"ai:booking:session:{session_key}"


def load_session_raw(session_key: str) -> Optional[dict[str, Any]]:
    r = require_redis()
    raw = r.get(redis_key(session_key))
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def save_session_raw(session_key: str, data: dict[str, Any]) -> None:
    r = require_redis()
    payload = json.dumps(data, default=str)
    r.setex(redis_key(session_key), TTL_SECONDS, payload)


def delete_session(session_key: str) -> None:
    r = require_redis()
    r.delete(redis_key(session_key))


def _glob_escape(value: str) -> str:
    """Escape Redis MATCH glob metacharacters."""
    return "".join("\\" + c if c in "*?[]\\" else c for c in value)


def _phone_variants(phone: str) -> list[str]:
    raw = (phone or "").strip()
    digits = "".join(c for c in raw if c.isdigit())
    out: list[str] = []
    for v in (raw, digits, f"+{digits}" if digits else ""):
        if v and v not in out:
            out.append(v)
    return out


def clear_session(
    tenant_id: int,
    phone: str,
    conversation_id: Optional[int] = None,
) -> int:
    """
    Delete booking/reschedule/cancel dialogue state for a customer. Call this when a
    human claims the chat so a stale half-finished flow cannot resume after release.

    Redis key (see booking_flow.session_key):
        ai:booking:session:{tenant_id}:{conversation_id or 0}:{phone}

    The conversation id is part of the key, so when `conversation_id` is None every
    conversation for that tenant+phone is cleared (SCAN, never KEYS). Phone is matched
    as given, digits-only, and +digits so formatting differences don't leave sessions behind.

    Returns the number of keys deleted. Raises BookingSessionUnavailable if Redis is down.
    """
    r = require_redis()
    tid = int(tenant_id)
    keys: set[str] = set()
    for p in _phone_variants(phone):
        if conversation_id is not None:
            keys.add(redis_key(f"{tid}:{int(conversation_id)}:{p}"))
            continue
        pattern = redis_key(f"{tid}:*:{_glob_escape(p)}")
        for k in r.scan_iter(match=pattern, count=200):
            keys.add(k)
    if conversation_id is not None:
        # also the legacy "no conversation id" key
        for p in _phone_variants(phone):
            keys.add(redis_key(f"{tid}:0:{p}"))
    if not keys:
        return 0
    return int(r.delete(*keys))
