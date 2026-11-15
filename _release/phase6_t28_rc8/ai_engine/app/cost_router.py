"""
RC8 — Smart Gemini model router + official USD cost estimates.

Official model IDs and paid-tier rates from Google AI Studio pricing
(checked 2026-11-15). Do not use Argon in normal production routing.
"""
from __future__ import annotations

import os
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

# ── Official API model IDs (Google AI Studio / Gemini Developer API) ─────────
MODEL_FLASH_LITE = "gemini-3.1-flash-lite"
MODEL_FLASH = "gemini-3.8-flash"
MODEL_HYDROGEN = "gemini-4-hydrogen"
MODEL_ARGON = "gemini-4-argon"  # NEVER route in normal production

# Paid tier USD per 1M tokens (input / output incl. thinking) — official list prices
# Source: https://aistudio.google.com/docs/pricing (and ai.google.dev pricing)
OFFICIAL_RATES_PER_1M: dict[str, dict[str, float]] = {
    MODEL_FLASH_LITE: {
        "input": 0.25,
        "output": 1.50,
        "cached_input": 0.025,
        "note": "text/image/video; audio input $0.50/1M not used in text router",
    },
    MODEL_FLASH: {
        "input": 0.75,  # through 2026-12-31; then $1.50
        "output": 3.75,  # through 2026-12-31; then $7.50
        "cached_input": 0.075,
        "note": "promo rates through 2026-12-31",
    },
    MODEL_HYDROGEN: {
        "input": 1.50,
        "output": 7.50,
        "cached_input": 0.075,
        "note": "thinking tokens billed in output",
    },
    # Recorded for completeness — blocked from select_model
    MODEL_ARGON: {
        "input": 2.00,  # through 2026-11-30; then $4.00
        "output": 10.00,  # through 2026-11-30; then $20.00
        "cached_input": 0.10,
        "note": "NOT used in normal production routing",
    },
}

# Budget policy (USD)
MONTHLY_HARD_CAP = 20.00
MONTHLY_PLANNED = 16.00
SAFETY_RESERVE = 4.00  # hard_cap - planned
TARGET_CONV_COST = 0.016
WARN_CONV_COST = 0.020
HARD_CONV_CAP = 0.030
DAILY_PLANNED = 0.53  # ~16/30

# Output token caps by tier (cost control)
MAX_OUT_LITE = 400
MAX_OUT_FLASH = 700
MAX_OUT_HYDROGEN = 900

TIER_LITE = "flash_lite"
TIER_NORMAL = "flash"
TIER_COMPLEX = "hydrogen"


@dataclass
class RouteDecision:
    tier: str
    model: str
    max_output_tokens: int
    reason: str
    allow_hydrogen: bool = True
    estimated_usd: float = 0.0
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def cost_router_enabled() -> bool:
    """RC8 router active unless explicitly disabled (preserves prod until deploy)."""
    v = (os.environ.get("GEMINI_COST_ROUTER") or "1").strip().lower()
    return v not in ("0", "false", "off", "no")


def estimate_cost_usd(
    model: str,
    *,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    thinking_tokens: int = 0,
    cached_tokens: int = 0,
) -> float:
    """Estimate USD from official per-1M rates. Thinking counted in output."""
    rates = OFFICIAL_RATES_PER_1M.get(model) or OFFICIAL_RATES_PER_1M[MODEL_FLASH]
    pin = max(0, int(prompt_tokens) - int(cached_tokens))
    cached = max(0, int(cached_tokens))
    out = max(0, int(completion_tokens) + int(thinking_tokens))
    usd = (
        (pin / 1_000_000.0) * float(rates["input"])
        + (cached / 1_000_000.0) * float(rates.get("cached_input") or rates["input"])
        + (out / 1_000_000.0) * float(rates["output"])
    )
    return round(usd, 8)


def classify_route_tier(
    message: str,
    *,
    has_media: bool = False,
    ask_units: int = 1,
    is_correction: bool = False,
    is_incomplete: bool = False,
    topic_switch: bool = False,
    emotion: Optional[str] = None,
    booking_paused: bool = False,
    multi_intent: bool = False,
) -> str:
    """
    Deterministic tier selection.
    - Lite: short classify/translate/affirm/simple FAQ
    - Flash: normal salon conversation
    - Hydrogen: complex ambiguity / multi-intent / long correction context
    """
    raw = (message or "").strip()
    t = raw.lower()
    words = len(raw.split())

    # Simple classification / translation / short affirm
    if words <= 4 and re.match(
        r"^(?:hi+|hello|hey+|hari|ow|yes|no|ok|okay|thanks?|istuti|"
        r"ආයුබෝවන්|හරි|ඔව්|නැහැ|1|2|3)\s*[!.]*$",
        t,
        re.I,
    ):
        return TIER_LITE
    if re.search(r"\b(?:translate|translation|sinhala\s+to\s+english|english\s+to)\b", t):
        return TIER_LITE
    if words <= 6 and re.search(
        r"\b(?:hours?|open|close|koheda|where|address|kiyada|keeyada|mila)\b", t
    ) and ask_units <= 1 and not has_media:
        return TIER_LITE

    complex_hit = (
        has_media
        or is_correction
        or topic_switch
        or multi_intent
        or ask_units >= 3
        or (is_incomplete and words <= 3)
        or booking_paused and ask_units >= 2
        or (emotion in ("fear", "confusion", "objection", "frustration"))
        or words >= 45
        or re.search(
            r"\b(?:compare|difference|vs|wada|alternative|recommend|"
            r"mathaka|kalin|complicated|confused|therune\s*na)\b",
            t,
        )
    )
    if complex_hit:
        return TIER_COMPLEX
    return TIER_NORMAL


def select_model(
    message: str,
    *,
    has_media: bool = False,
    ask_units: int = 1,
    is_correction: bool = False,
    is_incomplete: bool = False,
    topic_switch: bool = False,
    emotion: Optional[str] = None,
    booking_paused: bool = False,
    multi_intent: bool = False,
    allow_hydrogen: bool = True,
    monthly_spent: float = 0.0,
    planned_usd: float = MONTHLY_PLANNED,
) -> RouteDecision:
    """Pick model. Never returns Argon. Downgrade Hydrogen after planned budget."""
    tier = classify_route_tier(
        message,
        has_media=has_media,
        ask_units=ask_units,
        is_correction=is_correction,
        is_incomplete=is_incomplete,
        topic_switch=topic_switch,
        emotion=emotion,
        booking_paused=booking_paused,
        multi_intent=multi_intent,
    )
    # Stop non-essential high-cost escalation at planned usage
    if tier == TIER_COMPLEX and (not allow_hydrogen or monthly_spent >= planned_usd):
        tier = TIER_NORMAL
        reason = "complex_downgraded_to_flash_budget"
        allow_hydrogen = False
    elif tier == TIER_COMPLEX:
        reason = "complex_context_or_ambiguity"
    elif tier == TIER_LITE:
        reason = "simple_classify_or_short_faq"
    else:
        reason = "normal_conversation"

    if tier == TIER_LITE:
        model, max_out = MODEL_FLASH_LITE, MAX_OUT_LITE
    elif tier == TIER_COMPLEX and allow_hydrogen:
        model, max_out = MODEL_HYDROGEN, MAX_OUT_HYDROGEN
    else:
        model, max_out = MODEL_FLASH, MAX_OUT_FLASH
        if tier == TIER_COMPLEX:
            tier = TIER_NORMAL

    assert model != MODEL_ARGON
    return RouteDecision(
        tier=tier,
        model=model,
        max_output_tokens=max_out,
        reason=reason,
        allow_hydrogen=allow_hydrogen,
        meta={"argon_blocked": True},
    )


def trim_recent_messages(
    recent: Optional[list],
    *,
    max_turns: int = 8,
    max_chars: int = 400,
) -> list:
    """Cost optimization: keep a short recent window, not unlimited history."""
    if not recent:
        return []
    out = []
    for m in list(recent)[-max_turns:]:
        if not isinstance(m, dict):
            continue
        content = str(m.get("content") or "")[:max_chars]
        row = {"role": m.get("role"), "content": content}
        if m.get("images"):
            row["images"] = m.get("images")  # preserve multimodal when present
        out.append(row)
    return out


def build_call_accounting(
    *,
    tenant_id: Optional[int],
    conversation_id: Optional[int],
    model: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    thinking_tokens: int = 0,
    cached_tokens: int = 0,
    retry_count: int = 0,
    repair_count: int = 0,
    purpose: str = "whatsapp_turn",
) -> dict[str, Any]:
    """Per-API-call cost record (no API keys / no raw customer message)."""
    est = estimate_cost_usd(
        model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        thinking_tokens=thinking_tokens,
        cached_tokens=cached_tokens,
    )
    return {
        "tool": "gemini_cost_accounting",
        "ok": True,
        "tenant_id": tenant_id,
        "conversation_id": conversation_id,
        "model_id": model,
        "input_tokens": int(prompt_tokens or 0),
        "output_tokens": int(completion_tokens or 0),
        "thinking_tokens": int(thinking_tokens or 0),
        "cached_tokens": int(cached_tokens or 0),
        "retry_count": int(retry_count or 0),
        "repair_count": int(repair_count or 0),
        "estimated_usd": est,
        "billing_reconciliation": "estimated_official_rate",
        "purpose": purpose,
        "warn_conversation": est >= WARN_CONV_COST,
        "over_hard_conversation": est >= HARD_CONV_CAP,
    }
