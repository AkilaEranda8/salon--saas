"""
Advanced receptionist — response quality validator + multi-intent completeness.

Deterministic checks before WhatsApp send. Does not invent prices/services.
Bounded repair signal only (caller may retry Gemini once).
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from app.booking_flow import detect_service_category
from app.pricing_resolver import extract_lkr_amounts, is_price_enquiry


@dataclass
class AskUnit:
    kind: str  # price|duration|location|hours|service|booking|advice|compare|other
    label: str
    required_signals: list[str] = field(default_factory=list)


@dataclass
class QualityReport:
    ok: bool
    missing: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    ask_units: list[dict[str, Any]] = field(default_factory=list)
    repair_hint: str = ""
    falsely_claims_booking: bool = False
    invented_price_risk: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_DURATION_HINT = re.compile(
    r"\b(?:kochchara|duration|how\s+long|wela\s*yan|minutes?|min\b|වේලා|කොච්චර)\b",
    re.I,
)
_LOCATION_HINT = re.compile(
    r"\b(?:koheda|kohada|where|location|address|branch|කොහෙද|directions?)\b",
    re.I,
)
_HOURS_HINT = re.compile(r"\b(?:open|hours|closing|විවෘත)\b", re.I)
_BOOK_HINT = re.compile(r"\b(?:book|booking|appointment|reserve|වෙන්|බුක්)\b", re.I)
_COMPARE_HINT = re.compile(
    r"\b(?:wada|vs|versus|difference|compare|mita\s+wada|adu\s+eka|"
    r"mokakda\s+hoda|recommend|හොඳ)\b",
    re.I,
)
_ADVICE_HINT = re.compile(
    r"\b(?:hodaida|hodada|suitable|baya|worth|karanna\s+hoda|හොඳද)\b",
    re.I,
)
_FAKE_BOOK = re.compile(
    r"\b(?:lock(?:ed|ing)?\s+in|time\s+eka\s+fix|fix\s+kala|"
    r"appointment\s+(?:is\s+)?(?:confirmed|booked)|let'?s\s+lock\s+in)\b",
    re.I,
)
_PRICE_SIGNAL = re.compile(r"\b(?:rs\.?|lkr|රු|price|mila|gana)\b|\d{3,}", re.I)
_DURATION_SIGNAL = re.compile(r"\b\d{1,3}\s*(?:min|mins|minutes|hr|hrs|hour)\b|විනාඩි", re.I)
_LOCATION_SIGNAL = re.compile(
    r"\b(?:kandy|branch|mawatha|road|street|maps?|google|081|address)\b|ලිපින",
    re.I,
)


def decompose_customer_asks(
    message: str,
    *,
    prior_topic: Optional[str] = None,
) -> list[AskUnit]:
    """
    Split one customer message into independently answerable ask units.
    Conservative — better to over-detect than silently drop a question.
    """
    raw = (message or "").strip()
    if not raw:
        return []
    units: list[AskUnit] = []
    t = raw.lower()
    cat = detect_service_category(raw) or prior_topic

    # Multi-style hair asks
    if re.search(r"\bbutterfly\b", t):
        units.append(AskUnit("price", "butterfly_price", ["butterfly", "rs|price|mila|4500|not listed"]))
    if re.search(r"\blayer\b", t):
        units.append(AskUnit("service", "layer_availability", ["layer"]))
    if re.search(r"\bhydra\b", t):
        units.append(AskUnit("price", "hydra_price", ["hydra"]))
    if re.search(r"\bnormal\s*facial\b", t):
        units.append(AskUnit("price", "normal_facial_price", ["normal", "facial"]))

    if is_price_enquiry(raw) or re.search(r"\b(?:kiyada|keeyada|mila|gana|price|කීය)\b", t):
        units.append(
            AskUnit(
                "price",
                f"price_{cat or 'discussed'}",
                ["rs|lkr|price|mila|gana|රු|confirm"],
            )
        )
    if _DURATION_HINT.search(raw):
        units.append(AskUnit("duration", f"duration_{cat or 'service'}", ["min|minute|wela|duration|විනාඩි"]))
    if _LOCATION_HINT.search(raw):
        units.append(AskUnit("location", "branch_location", ["address|branch|kandy|mawatha|maps|phone|081"]))
    if _HOURS_HINT.search(raw) and not _BOOK_HINT.search(raw):
        units.append(AskUnit("hours", "opening_hours", ["open|close|hour|am|pm|විවෘත|confirm"]))
    if _BOOK_HINT.search(raw):
        units.append(AskUnit("booking", "booking_help", ["date|time|book|yes|slot|appointment"]))
    if _ADVICE_HINT.search(raw) or _COMPARE_HINT.search(raw):
        units.append(AskUnit("advice", "advice_or_compare", ["hoda|option|alternative|suggest|recommend|value"]))
    if cat and not any(u.kind == "service" for u in units):
        if re.search(r"\b(?:thiyenawada|thiyenne|options?|monda|monawada)\b", t):
            units.append(AskUnit("service", f"service_{cat}", [str(cat)]))

    # Deduplicate by label
    seen: set[str] = set()
    out: list[AskUnit] = []
    for u in units:
        if u.label in seen:
            continue
        seen.add(u.label)
        out.append(u)
    return out


def _unit_answered(unit: AskUnit, reply: str) -> bool:
    r = (reply or "").lower()
    if not r.strip():
        return False
    if unit.kind == "price":
        return bool(_PRICE_SIGNAL.search(r) or extract_lkr_amounts(reply) or re.search(r"confirm|team|stylist|list wela naha|not listed", r))
    if unit.kind == "duration":
        return bool(_DURATION_SIGNAL.search(r) or re.search(r"duration|wela|min", r))
    if unit.kind == "location":
        return bool(_LOCATION_SIGNAL.search(r))
    if unit.kind == "hours":
        return bool(re.search(r"\b(?:open|close|am|pm|hour|විවෘත|confirm)\b", r))
    if unit.kind == "booking":
        return bool(re.search(r"\b(?:date|time|book|slot|yes|appointment|heta|tomorrow)\b", r))
    if unit.kind == "advice":
        return len(r.split()) >= 6  # non-empty substantive reply
    if unit.kind == "service":
        # at least mention the label token or catalogue language
        token = unit.label.replace("service_", "").replace("_", " ")
        return token in r or bool(re.search(r"\b(?:service|thiyen|option|cut|facial|treatment)\b", r))
    return True


def validate_customer_reply(
    message: str,
    reply: str,
    *,
    prior_topic: Optional[str] = None,
    booking_confirmed: bool = False,
    price_hard_gated: bool = False,
) -> QualityReport:
    """
    Pre-send validator. ok=False → caller should bounded-repair or clarify once.
    """
    units = decompose_customer_asks(message, prior_topic=prior_topic)
    missing: list[str] = []
    warnings: list[str] = []
    for u in units:
        if not _unit_answered(u, reply):
            missing.append(u.label)

    falsely = bool(_FAKE_BOOK.search(reply or "")) and not booking_confirmed
    invented = False
    if is_price_enquiry(message) and extract_lkr_amounts(reply) and not price_hard_gated:
        # Soft warning only — hard invent block lives in pricing_resolver / main gates
        invented = False
        warnings.append("price_amounts_present_outside_hard_gate")

    if falsely:
        missing.append("false_booking_claim")

    repair = ""
    if missing:
        repair = (
            "Your previous reply missed: "
            + ", ".join(missing[:8])
            + ". Rewrite ONE WhatsApp reply that covers EACH missing part using verified salon data only. "
            "Do not invent prices. Do not claim booking success."
        )

    return QualityReport(
        ok=not missing and not falsely,
        missing=missing,
        warnings=warnings,
        ask_units=[asdict(u) for u in units],
        repair_hint=repair,
        falsely_claims_booking=falsely,
        invented_price_risk=invented,
    )


def merge_memory_correction(
    memory: Optional[dict[str, Any]],
    *,
    field: str,
    new_value: Any,
    reason: str = "customer_correction",
) -> dict[str, Any]:
    """
    Update a memory field on correction — replace rather than keep conflicting values.
    """
    mem = dict(memory or {})
    old = mem.get(field)
    mem[field] = new_value
    hist = list(mem.get("correction_log") or [])
    hist.append({"field": field, "from": old, "to": new_value, "reason": reason})
    mem["correction_log"] = hist[-12:]
    # Clear stale twin keys that would contradict
    if field == "last_service":
        mem["current_topic"] = new_value
        mem.pop("unresolved_question", None)
    if field == "hair_length":
        mem["hair_length"] = new_value
    return mem
