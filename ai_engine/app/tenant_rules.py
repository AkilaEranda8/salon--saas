"""Fetch tenant AI rules from salon internal API."""
from __future__ import annotations

import os
from typing import Any

import httpx

from app.auth import SERVICE_SECRET

SALON_BASE = os.getenv("SALON_API_URL", "http://localhost:5000/api").rstrip("/")


async def fetch_tenant_rules_block(tenant_id: int) -> str:
    """Return formatted mandatory rules block (empty string if none / error)."""
    headers = {
        "X-Service-Key": SERVICE_SECRET,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{SALON_BASE}/crm/internal/rules/{tenant_id}",
                headers=headers,
            )
            if not r.is_success:
                return ""
            data: dict[str, Any] = r.json()
            return str(data.get("rulesBlock") or "").strip()
    except Exception:
        return ""
