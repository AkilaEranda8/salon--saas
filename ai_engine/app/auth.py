"""Fail-closed service-to-service authentication."""
from __future__ import annotations

import hmac
import os
import sys

from fastapi import Header, HTTPException


def require_service_secret_at_startup() -> str:
    secret = (os.getenv("AI_ENGINE_SERVICE_SECRET") or "").strip()
    env = (os.getenv("NODE_ENV") or os.getenv("ENV") or "development").lower()
    if not secret:
        if env in ("production", "prod"):
            print("FATAL: AI_ENGINE_SERVICE_SECRET is required in production", file=sys.stderr)
            sys.exit(1)
        print(
            "FATAL: AI_ENGINE_SERVICE_SECRET is required (fail-closed). "
            "Set a strong shared secret before starting ai_engine.",
            file=sys.stderr,
        )
        sys.exit(1)
    if len(secret) < 16:
        print("FATAL: AI_ENGINE_SERVICE_SECRET must be at least 16 characters", file=sys.stderr)
        sys.exit(1)
    return secret


SERVICE_SECRET = require_service_secret_at_startup()


def check_service_auth(
    authorization: str | None = Header(default=None),
    x_service_key: str | None = Header(default=None, alias="X-Service-Key"),
) -> None:
    token = (x_service_key or "") or (authorization or "").replace("Bearer ", "").strip()
    if not token or not hmac.compare_digest(token, SERVICE_SECRET):
        raise HTTPException(status_code=401, detail="Invalid service credentials")
