"""
AI Tool Layer — named tools the conversation engine can call.
"""
from __future__ import annotations

from typing import Any, Callable, Awaitable

from . import salon_client as api

ToolFn = Callable[..., Awaitable[Any]]

TOOLS: dict[str, ToolFn] = {}


def tool(name: str):
    def deco(fn: ToolFn):
        TOOLS[name] = fn
        return fn
    return deco


@tool("customer_lookup")
async def customer_lookup(tenant_id: int, phone: str):
    return await api.customer_lookup(tenant_id, phone)


@tool("list_branches")
async def list_branches(tenant_id: int):
    return await api.list_branches(tenant_id)


@tool("list_services")
async def list_services(tenant_id: int):
    return await api.list_services(tenant_id)


@tool("list_staff")
async def list_staff(tenant_id: int, service_id: int | None = None):
    return await api.list_staff(tenant_id, service_id)


@tool("check_availability")
async def check_availability(tenant_id: int, staff_id: int, date: str, duration: int = 30):
    return await api.check_availability(tenant_id, staff_id, date, duration)


@tool("list_packages")
async def list_packages(tenant_id: int):
    return await api.list_packages(tenant_id)


@tool("list_promotions")
async def list_promotions(tenant_id: int):
    return await api.list_promotions(tenant_id)


@tool("search_knowledge")
async def search_knowledge(tenant_id: int, q: str, limit: int = 5):
    return await api.search_knowledge(tenant_id, q, limit)


@tool("list_appointments")
async def list_appointments(tenant_id: int, phone: str):
    return await api.list_appointments(tenant_id, phone)


@tool("book_appointment")
async def book_appointment(tenant_id: int, **payload):
    return await api.book_appointment(tenant_id, payload)


@tool("reschedule_appointment")
async def reschedule_appointment(tenant_id: int, appointment_id: int, **payload):
    return await api.reschedule_appointment(tenant_id, appointment_id, payload)


@tool("cancel_appointment")
async def cancel_appointment(tenant_id: int, appointment_id: int, reason: str = ""):
    return await api.cancel_appointment(tenant_id, appointment_id, reason)


async def run_tool(name: str, **kwargs) -> Any:
    if name not in TOOLS:
        raise ValueError(f"Unknown tool: {name}")
    return await TOOLS[name](**kwargs)


def list_tool_names() -> list[str]:
    return sorted(TOOLS.keys())
