"""
Salon CRM Integration tool client — calls /api/crm-integration/*
"""
from __future__ import annotations

import os
from typing import Any, Optional

import httpx

SALON_BASE = os.getenv("SALON_API_URL", "http://localhost:5000/api").rstrip("/")
SERVICE_SECRET = os.getenv("AI_ENGINE_SERVICE_SECRET", "")

_client = httpx.AsyncClient(timeout=20.0)


def _headers(tenant_id: int) -> dict[str, str]:
    if not SERVICE_SECRET:
        raise RuntimeError("AI_ENGINE_SERVICE_SECRET is required for salon tool calls")
    return {
        "X-Tenant-Id": str(tenant_id),
        "Content-Type": "application/json",
        "X-Service-Key": SERVICE_SECRET,
    }


async def _get(path: str, tenant_id: int, params: Optional[dict] = None) -> Any:
    r = await _client.get(
        f"{SALON_BASE}/crm-integration{path}",
        params=params or {},
        headers=_headers(tenant_id),
    )
    r.raise_for_status()
    return r.json()


async def _post(path: str, tenant_id: int, body: dict) -> Any:
    r = await _client.post(
        f"{SALON_BASE}/crm-integration{path}",
        json=body,
        headers=_headers(tenant_id),
    )
    r.raise_for_status()
    return r.json()


async def _put(path: str, tenant_id: int, body: dict) -> Any:
    r = await _client.put(
        f"{SALON_BASE}/crm-integration{path}",
        json=body,
        headers=_headers(tenant_id),
    )
    r.raise_for_status()
    return r.json()


async def customer_lookup(tenant_id: int, phone: str) -> dict:
    return await _get("/customers/by-phone", tenant_id, {"phone": phone})


async def list_branches(tenant_id: int) -> list:
    return await _get("/branches", tenant_id)


async def list_services(tenant_id: int) -> list:
    return await _get("/services", tenant_id)


async def list_staff(tenant_id: int, service_id: int | None = None) -> list:
    params = {}
    if service_id:
        params["serviceId"] = service_id
    return await _get("/staff", tenant_id, params)


async def check_availability(
    tenant_id: int,
    staff_id: int,
    date: str,
    duration: int = 30,
) -> dict:
    return await _get(
        "/availability",
        tenant_id,
        {"staffId": staff_id, "date": date, "duration": duration},
    )


async def list_packages(tenant_id: int) -> list:
    return await _get("/packages", tenant_id)


async def list_promotions(tenant_id: int) -> list:
    return await _get("/promotions", tenant_id)


async def search_knowledge(tenant_id: int, q: str, limit: int = 5) -> dict:
    return await _get("/knowledge/search", tenant_id, {"q": q, "limit": limit})


async def list_appointments(tenant_id: int, phone: str) -> list:
    return await _get("/appointments", tenant_id, {"phone": phone})


async def book_appointment(tenant_id: int, payload: dict) -> dict:
    return await _post("/appointments", tenant_id, payload)


async def reschedule_appointment(tenant_id: int, appointment_id: int, payload: dict) -> dict:
    return await _put(f"/appointments/{appointment_id}", tenant_id, payload)


async def cancel_appointment(tenant_id: int, appointment_id: int, reason: str = "") -> dict:
    return await _post(
        f"/appointments/{appointment_id}/cancel",
        tenant_id,
        {"reason": reason},
    )
