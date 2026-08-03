"""Fetch tenant AI provider keys from salon internal API (never from turn body)."""
from __future__ import annotations

import os
from typing import Any, Optional

import httpx

from app.auth import SERVICE_SECRET

SALON_BASE = os.getenv("SALON_API_URL", "http://localhost:5000/api").rstrip("/")


async def fetch_tenant_ai_settings(tenant_id: int) -> dict[str, Any]:
    headers = {
        "X-Service-Key": SERVICE_SECRET,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            f"{SALON_BASE}/crm/internal/ai-settings/{tenant_id}",
            headers=headers,
        )
        r.raise_for_status()
        return r.json()


async def resolve_provider_key(tenant_id: int, provider: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Returns (api_key, provider, model)."""
    data = await fetch_tenant_ai_settings(tenant_id)
    prov = (provider or data.get("provider") or "openai").lower()
    model = data.get("model")
    if prov == "gemini":
        return data.get("gemini_api_key"), prov, model
    return data.get("openai_api_key"), prov, model
