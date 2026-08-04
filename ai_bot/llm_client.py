"""
LLM client for Hexaone AI Chat Assistant.
Prefers tenant CRM AI settings (Gemini / OpenAI), then env keys, then NVIDIA NIM.
"""
from __future__ import annotations

import os
from typing import Any, Optional

import httpx
from openai import AsyncOpenAI

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_MODEL = "meta/llama-3.3-70b-instruct"

GEMINI_ENV_KEY = os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
SALON_BASE = os.getenv("SALON_API_URL", "http://localhost:5000/api").rstrip("/")
SERVICE_SECRET = (
    os.getenv("AI_ENGINE_SERVICE_SECRET", "")
    or os.getenv("CRM_SERVICE_SECRET", "")
).strip()

GEMINI_MODELS = (
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
)

_nvidia_client: AsyncOpenAI | None = None


SYSTEM_PROMPT = """You are the full salon operations AI assistant for THIS salon only (Hexaone / Xane).

You help the logged-in salon owner/staff with anything about their salon:
- Appointments (today, pending, schedule)
- Revenue / payments
- Services, prices, packages
- Staff performance
- Inventory / low stock
- Walk-in queue
- Customers
- Branches / locations
- Booking guidance

Rules:
- Use ONLY the live salon data provided in context for numbers and lists
- Never invent revenue, appointments, stock, or customer counts
- If data is missing, say what page to open (Appointments, Payments, Inventory, Walk-in, Reports)
- Reply in the user's language (English or Sinhala)
- Be concise, practical, WhatsApp/chat friendly — under 220 words
- Use markdown (**bold**, bullets)
- Never discuss another salon or platform admin data
"""


def _nvidia_client_get() -> AsyncOpenAI | None:
    global _nvidia_client
    if not NVIDIA_API_KEY:
        return None
    if _nvidia_client is None:
        _nvidia_client = AsyncOpenAI(
            base_url=NVIDIA_BASE_URL,
            api_key=NVIDIA_API_KEY,
        )
    return _nvidia_client


async def fetch_tenant_ai_settings(tenant_id: int | None) -> dict[str, Any]:
    if not tenant_id or not SERVICE_SECRET:
        return {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{SALON_BASE}/crm/internal/ai-settings/{tenant_id}",
                headers={
                    "X-Service-Key": SERVICE_SECRET,
                    "Content-Type": "application/json",
                },
            )
            if r.is_success:
                return r.json() or {}
    except Exception as e:
        print(f"[AI Chat LLM] settings fetch failed: {e}")
    return {}


def is_available(tenant_id: int | None = None) -> bool:
    """True if any provider key might be available for this chat."""
    if GEMINI_ENV_KEY or NVIDIA_API_KEY:
        return True
    # Tenant CRM keys are loaded at reply time
    return bool(tenant_id and SERVICE_SECRET)


def _build_messages(
    user_message: str,
    context: str = "",
    history: list | None = None,
) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if history:
        for h in history[-6:]:
            role = "user" if h.get("role") == "user" else "assistant"
            messages.append({"role": role, "content": h.get("text", "")})
    if context:
        messages.append({
            "role": "system",
            "content": f"Live salon data for this query:\n{context}",
        })
    messages.append({"role": "user", "content": user_message})
    return messages


async def _gemini_complete(api_key: str, model: str, messages: list[dict[str, str]]) -> str | None:
    parts: list[str] = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        parts.append(f"{role.upper()}: {content}")
    prompt = "\n\n".join(parts)

    preferred = (model or GEMINI_MODELS[0]).strip()
    candidates: list[str] = []
    for m in (preferred, *GEMINI_MODELS):
        if m and m not in candidates:
            candidates.append(m)

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.35,
            "maxOutputTokens": 512,
        },
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        last_error = ""
        for model_name in candidates:
            url = (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model_name}:generateContent"
            )
            response = await client.post(
                url,
                params={"key": api_key},
                json=payload,
            )
            if response.status_code < 400:
                data = response.json()
                try:
                    cands = data.get("candidates") or []
                    out_parts = (((cands[0] or {}).get("content") or {}).get("parts") or [])
                    text = "".join(p.get("text") or "" for p in out_parts).strip()
                    return text or None
                except Exception:
                    return None
            last_error = f"{response.status_code}: {response.text[:200]}"
            if response.status_code in (429, 404, 503):
                continue
            print(f"[Gemini] error {last_error}")
            return None
        print(f"[Gemini] all models failed: {last_error}")
        return None


async def _openai_compatible(
    api_key: str,
    base_url: str,
    model: str,
    messages: list[dict[str, str]],
) -> str | None:
    try:
        client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        completion = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.35,
            max_tokens=512,
            stream=False,
        )
        return (completion.choices[0].message.content or "").strip() or None
    except Exception as e:
        print(f"[OpenAI-compat LLM] Error: {e}")
        return None


async def _nvidia_complete(messages: list[dict[str, str]]) -> str | None:
    client = _nvidia_client_get()
    if not client:
        return None
    try:
        completion = await client.chat.completions.create(
            model=NVIDIA_MODEL,
            messages=messages,
            temperature=0.35,
            max_tokens=512,
            stream=False,
        )
        return (completion.choices[0].message.content or "").strip() or None
    except Exception as e:
        print(f"[NIM LLM] Error: {e}")
        return None


async def llm_reply(
    user_message: str,
    context: str = "",
    history: list | None = None,
    tenant_id: int | None = None,
) -> str | None:
    """
    Natural language reply for AI Chat.
    Provider order: tenant CRM settings → GEMINI_API_KEY → NVIDIA_API_KEY.
    """
    messages = _build_messages(user_message, context=context, history=history)
    settings = await fetch_tenant_ai_settings(tenant_id)

    provider = str(settings.get("provider") or "").lower().strip()
    model = str(settings.get("model") or "").strip()
    gemini_key = (settings.get("gemini_api_key") or "").strip() or GEMINI_ENV_KEY
    openai_key = (settings.get("openai_api_key") or "").strip()

    # Prefer explicit tenant provider when key exists
    if provider == "gemini" and gemini_key:
        return await _gemini_complete(gemini_key, model or GEMINI_MODELS[0], messages)
    if provider == "openai" and openai_key:
        return await _openai_compatible(
            openai_key,
            "https://api.openai.com/v1",
            model or "gpt-4o-mini",
            messages,
        )
    if provider == "nvidia" and NVIDIA_API_KEY:
        return await _nvidia_complete(messages)

    # Fallbacks if provider unset / key missing
    if gemini_key:
        return await _gemini_complete(gemini_key, model or GEMINI_MODELS[0], messages)
    if openai_key:
        return await _openai_compatible(
            openai_key,
            "https://api.openai.com/v1",
            model or "gpt-4o-mini",
            messages,
        )
    if NVIDIA_API_KEY:
        return await _nvidia_complete(messages)

    return None
