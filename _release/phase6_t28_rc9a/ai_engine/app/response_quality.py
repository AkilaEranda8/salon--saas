"""
Advanced receptionist — response quality validator + multi-intent completeness.

RC7: intent coverage, multi-question completeness, source/price/service identity,
context consistency, language match, repetition, hallucination heuristics,
false booking claims, media-claim guard, tool-success awareness.
Deterministic checks before WhatsApp send. Does not invent prices/services.
Bounded repair signal only (caller may retry Gemini once — never invent facts).
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from app.booking_flow import detect_lang, detect_script_mode, detect_service_category
from app.pricing_resolver import extract_lkr_amounts, is_price_enquiry


@dataclass
class AskUnit:
    kind: str  # price|duration|location|hours|service|booking|advice|compare|other|objection
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
    language_mismatch: bool = False
    repetition: bool = False
    media_claim_without_media: bool = False
    tool_failure_unacknowledged: bool = False
    context_inconsistency: bool = False

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
_MEDIA_CLAIM = re.compile(
    r"\b(?:i\s+(?:can\s+)?see\s+(?:your\s+)?(?:photo|image|picture)|"
    r"from\s+(?:the\s+)?(?:photo|image|picture)|looking\s+at\s+(?:your\s+)?(?:photo|image)|"
    r"photo\s+eka\s+(?:baluwa|dækka|dakka)|image\s+eka\s+baluwa|"
    r"voice\s+(?:eka\s+)?(?:ahuna|heard)|i\s+heard\s+your\s+(?:voice|audio))\b",
    re.I,
)
_SINHALA_SCRIPT = re.compile(r"[\u0D80-\u0DFF]")
_HEALTH_DIAG = re.compile(
    r"\b(?:you\s+have\s+(?:eczema|psoriasis|dermatitis|fungal)|"
    r"diagnos(?:e|is)|medical\s+condition|skin\s+disease)\b",
    re.I,
)
_GENERIC_BOOK_PROMPT = re.compile(
    r"\b(?:date\s*(?:\/|,|and|&)?\s*time\s+kiyanna|book\s+karanna\s+oni|"
    r"would\s+you\s+like\s+to\s+book|shall\s+i\s+book|"
    r"appointment\s+eka\s+fix|lock\s+in\s+a\s+(?:date|time))\b",
    re.I,
)
_UNRELATED_PITCH = re.compile(
    r"\b(?:bridal\s+package|we\s+also\s+offer|recommend(?:ed)?\s+(?:our\s+)?|"
    r"popular\s+(?:services?|packages?)|you\s+may\s+(?:also\s+)?like|"
    r"special\s+package|combo\s+deal)\b",
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
        # Must be substantive AND not a pure booking pitch with no advice signal
        if len(r.split()) < 6:
            return False
        if _GENERIC_BOOK_PROMPT.search(r) and not re.search(
            r"\b(?:hoda|suitable|recommend|option|depend|hair|damage|safe|alternative)\b", r
        ):
            return False
        return True
    if unit.kind == "service":
        token = unit.label.replace("service_", "").replace("_", " ")
        return token in r or bool(re.search(r"\b(?:service|thiyen|option|cut|facial|treatment)\b", r))
    return True


def _language_mismatch(message: str, reply: str) -> bool:
    """Flag hard script mismatch: Sinhala Unicode ask vs pure Latin formal English essay."""
    msg = message or ""
    rep = reply or ""
    if not msg.strip() or not rep.strip():
        return False
    msg_si = bool(_SINHALA_SCRIPT.search(msg))
    rep_si = bool(_SINHALA_SCRIPT.search(rep))
    # Customer wrote Sinhala script; reply has zero Sinhala and is long English-only → mismatch
    if msg_si and not rep_si and len(rep.split()) > 40:
        return True
    # Customer clearly Singlish Latin; reply dumps dense Sinhala Unicode
    sm = detect_script_mode(msg)
    if sm == "latin" and detect_lang(msg) in ("si", "en") and rep_si and not re.search(
        r"[A-Za-z]{3,}", msg
    ):
        return False  # rare edge
    if sm == "latin" and re.search(r"\b(?:kiyada|keeyada|oni|hari|heta|mila)\b", msg, re.I):
        # Singlish ask → heavy Sinhala-only reply is mismatch
        if rep_si and len(re.findall(r"[A-Za-z]+", rep)) < 3 and len(rep) > 40:
            return True
    return False


def _is_repetition(reply: str, prior_ai: Optional[str]) -> bool:
    if not prior_ai or not reply:
        return False
    a = re.sub(r"\s+", " ", prior_ai.lower()).strip()[:280]
    b = re.sub(r"\s+", " ", reply.lower()).strip()[:280]
    if len(a) < 40 or len(b) < 40:
        return False
    if a == b:
        return True
    # High overlap of content words
    wa = set(re.findall(r"[a-z\u0d80-\u0dff]{4,}", a))
    wb = set(re.findall(r"[a-z\u0d80-\u0dff]{4,}", b))
    if not wa or not wb:
        return False
    overlap = len(wa & wb) / max(1, min(len(wa), len(wb)))
    return overlap >= 0.92 and abs(len(a) - len(b)) < 40


def _media_claim_without_media(reply: str, *, has_media: bool) -> bool:
    if has_media:
        return False
    return bool(_MEDIA_CLAIM.search(reply or ""))


def _tool_failure_unacked(reply: str, actions: Optional[list]) -> bool:
    if not actions:
        return False
    failed = [
        a for a in actions
        if isinstance(a, dict)
        and a.get("tool") in (
            "book_appointment", "cancel_appointment", "reschedule_appointment",
            "check_availability", "list_services",
        )
        and a.get("ok") is False
    ]
    if not failed:
        return False
    r = (reply or "").lower()
    # If tool failed but reply claims success / ignores failure
    if _FAKE_BOOK.search(reply or ""):
        return True
    if any(a.get("tool") == "book_appointment" for a in failed):
        if re.search(r"\b(?:booked|confirmed|locked)\b", r) and not re.search(
            r"\b(?:couldn'?t|unable|fail|try\s+again|issue|problem)\b", r
        ):
            return True
    return False


def _is_informational_ask(message: str) -> bool:
    """Price / duration / location / hours / advice — not an explicit book request."""
    raw = message or ""
    if _BOOK_HINT.search(raw) and not (
        is_price_enquiry(raw) or _DURATION_HINT.search(raw) or _LOCATION_HINT.search(raw)
        or _ADVICE_HINT.search(raw) or _HOURS_HINT.search(raw)
    ):
        return False
    return bool(
        is_price_enquiry(raw)
        or _DURATION_HINT.search(raw)
        or _LOCATION_HINT.search(raw)
        or _HOURS_HINT.search(raw)
        or _ADVICE_HINT.search(raw)
        or re.search(r"\b(?:kiyada|keeyada|eka|ekata|mathaka)\b", raw, re.I)
    )


def _off_topic_recommendation(message: str, reply: str, *, expected_topic: Optional[str]) -> bool:
    """True when informational ask is answered with unrelated pitch / generic book CTA only."""
    if not message or not reply:
        return False
    if not _is_informational_ask(message):
        return False
    r = reply.lower()
    units = decompose_customer_asks(message, prior_topic=expected_topic)
    answered_any = any(_unit_answered(u, reply) for u in units) if units else False
    # Generic booking CTA without answering the ask
    if units and not answered_any and _GENERIC_BOOK_PROMPT.search(r):
        return True
    # Unrelated package pitch without topic tokens
    if _UNRELATED_PITCH.search(r):
        topic = (expected_topic or detect_service_category(message) or "").lower()
        if topic and topic not in r and not answered_any:
            return True
        if re.search(r"\bbridal\b", r) and topic in ("haircut", "hair_cut", "cut", "keratin", "facial"):
            if not re.search(re.escape(topic), r) and not re.search(
                r"\b(?:cut|keratin|facial|butterfly|layer)\b", r
            ):
                return True
    return False


def _context_inconsistency(
    reply: str,
    *,
    expected_topic: Optional[str],
    message: str,
) -> bool:
    """Soft: reply hard-pivots to unrelated bridal when ask is clearly haircut."""
    if not expected_topic or not reply:
        return False
    msg_cat = detect_service_category(message) or expected_topic
    if not msg_cat:
        return False
    r = reply.lower()
    # Haircut ask answered only with bridal package pitch
    if msg_cat in ("haircut", "hair_cut", "cut") or re.search(r"\b(?:butterfly|layer|bob)\b", message, re.I):
        if re.search(r"\bbridal\b", r) and not re.search(
            r"\b(?:cut|butterfly|layer|haircut|trim)\b", r
        ):
            return True
    if _off_topic_recommendation(message, reply, expected_topic=expected_topic):
        return True
    return False


def validate_customer_reply(
    message: str,
    reply: str,
    *,
    prior_topic: Optional[str] = None,
    booking_confirmed: bool = False,
    price_hard_gated: bool = False,
    has_media: bool = False,
    prior_ai_reply: Optional[str] = None,
    verified_amounts: Optional[list[int]] = None,
    actions: Optional[list] = None,
    expected_service: Optional[str] = None,
) -> QualityReport:
    """
    Pre-send validator. ok=False → caller should bounded-repair or clarify once.
    Never invents missing facts in repair_hint — only lists gaps.
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
        warnings.append("price_amounts_present_outside_hard_gate")

    # Price identity: if verified amounts provided, flag invent
    if verified_amounts is not None and extract_lkr_amounts(reply):
        got = set(extract_lkr_amounts(reply))
        allowed = set(int(x) for x in verified_amounts)
        if got and allowed and not got.issubset(allowed):
            invented = True
            missing.append("price_identity")
            warnings.append("unverified_price_amounts")

    lang_mis = _language_mismatch(message, reply)
    if lang_mis:
        missing.append("language_match")
        warnings.append("language_mismatch")

    repet = _is_repetition(reply, prior_ai_reply)
    if repet:
        missing.append("repetition")
        warnings.append("near_duplicate_prior_reply")

    media_bad = _media_claim_without_media(reply, has_media=has_media)
    if media_bad:
        missing.append("media_claim_without_media")

    tool_bad = _tool_failure_unacked(reply, actions)
    if tool_bad:
        missing.append("tool_failure_unacknowledged")

    ctx_bad = _context_inconsistency(
        reply, expected_topic=expected_service or prior_topic, message=message
    )
    if ctx_bad:
        missing.append("context_consistency")
        warnings.append("service_identity_drift")

    if _off_topic_recommendation(message, reply, expected_topic=expected_service or prior_topic):
        if "context_consistency" not in missing:
            missing.append("off_topic_recommendation")
        warnings.append("unrelated_or_generic_booking_pitch")

    if _HEALTH_DIAG.search(reply or ""):
        missing.append("health_diagnosis_forbidden")
        warnings.append("health_diagnosis")

    if falsely:
        missing.append("false_booking_claim")

    repair = ""
    if missing:
        repair = (
            "Your previous reply had gaps: "
            + ", ".join(missing[:10])
            + ". Rewrite ONE WhatsApp reply that covers EACH missing customer ask using "
            "ONLY verified salon data already available. "
            "Answer the customer's ACTUAL question(s) first. "
            "Do NOT replace their ask with unrelated service recommendations. "
            "Do NOT send a generic booking prompt when they asked price/duration/location/advice. "
            "Do not invent prices, services, or booking success. "
            "Do not claim you saw a photo/heard audio unless media was actually provided. "
            "Do not diagnose medical/skin conditions. "
            "Match the customer's language (Singlish/Sinhala/English). "
            "If a fact is unknown, say you will confirm with the team — never fabricate. "
            "Use conversation memory for 'eka' / prior service — do not ask them to repeat."
        )

    return QualityReport(
        ok=not missing and not falsely,
        missing=missing,
        warnings=warnings,
        ask_units=[asdict(u) for u in units],
        repair_hint=repair,
        falsely_claims_booking=falsely,
        invented_price_risk=invented,
        language_mismatch=lang_mis,
        repetition=repet,
        media_claim_without_media=media_bad,
        tool_failure_unacknowledged=tool_bad,
        context_inconsistency=ctx_bad,
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
    if field == "last_service":
        mem["current_topic"] = new_value
        mem.pop("unresolved_question", None)
        # RC9 audit: stale catalogue ID must not survive a service-name correction
        mem["last_service_id"] = None
        mem["pricing_service_key"] = None
        truth = dict(mem.get("conversation_truth") or {}) if isinstance(mem.get("conversation_truth"), dict) else {}
        truth["selected_service_id"] = {
            "value": None,
            "confidence": 0.0,
            "confirmed": False,
            "source_message": reason,
        }
        truth["selected_service_name"] = {
            "value": new_value,
            "confidence": 0.95,
            "confirmed": True,
            "source_message": reason,
        }
        mem["conversation_truth"] = truth
    if field == "hair_length":
        mem["hair_length"] = new_value
    return mem


def scrub_sensitive_memory(meta: Optional[dict[str, Any]]) -> dict[str, Any]:
    """
    Retention / privacy: drop keys that should not persist in CRM memory.
    """
    mem = dict(meta or {})
    for k in list(mem.keys()):
        lk = str(k).lower()
        if any(
            x in lk
            for x in (
                "api_key", "password", "secret", "card", "nic", "passport",
                "otp", "cvv", "bank_account",
            )
        ):
            mem.pop(k, None)
    # Cap correction log
    if isinstance(mem.get("correction_log"), list):
        mem["correction_log"] = mem["correction_log"][-12:]
    if isinstance(mem.get("commitments"), list):
        mem["commitments"] = mem["commitments"][-8:]
    if isinstance(mem.get("pending_questions"), list):
        mem["pending_questions"] = mem["pending_questions"][-8:]
    return mem
