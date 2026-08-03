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
