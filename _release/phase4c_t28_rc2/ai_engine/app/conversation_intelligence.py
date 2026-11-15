"""
Larvendo Phase 2+ — Conversation intelligence layer.

Gemini remains the response generator; this module builds structured context,
context-aware intent, and response-decision guidance so replies stay on the
customer's real ask (topic switch, correction, memory, image+text).

Deterministic / testable — no live Gemini calls here.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from app.booking_flow import (
    detect_lang,
    detect_script_mode,
    detect_service_category,
    is_catalogue_ask,
    is_correction_message,
    is_details_before_book,
    is_faq_message,
    is_media_message,
    is_resume_booking_message,
    lang_label,
)
from app.pricing_resolver import is_price_enquiry


# ── Intent taxonomy (V2) ─────────────────────────────────────────────────────

INTENT_GREETING = "greeting"
INTENT_GENERAL = "general"
INTENT_SERVICE = "service_enquiry"
INTENT_PRICE = "price_enquiry"
INTENT_DURATION = "duration_enquiry"
INTENT_IMAGE = "image_enquiry"
INTENT_RECOMMEND = "recommendation"
INTENT_BOOK = "booking_enquiry"
INTENT_BOOK_CONTINUE = "booking_continuation"
INTENT_BOOK_MODIFY = "booking_modification"
INTENT_CANCEL = "cancellation"
INTENT_RESCHEDULE = "rescheduling"
INTENT_HOURS = "opening_hours"
INTENT_BRANCH = "branch_information"
INTENT_STAFF = "staff_information"
INTENT_COMPLAINT = "customer_complaint"
INTENT_DISCOUNT = "discount_enquiry"
INTENT_HANDOFF = "human_handoff"
INTENT_CLARIFY = "clarification"
INTENT_CORRECTION = "correction"
INTENT_OBJECTION = "objection"
INTENT_CASUAL = "casual"
INTENT_LANGUAGE = "language"
INTENT_AFTERCARE = "advice"


_DURATION_RE = re.compile(
    r"\b(?:how\s+long|duration|kochchara\s+wela|wela\s+yanawa|කොච්චර\s*වෙලා|වේලාව)\b",
    re.I,
)
_RECOMMEND_RE = re.compile(
    r"\b(?:recommend|suggest|best\s+for|mata\s+hari|smooth\s+karaganna|suitable|"
    r"mokakda\s+honda|හොඳම|suggest\s+karanna|"
    r"me\s+wage|this\s+style|similar\s+(?:to|style)|wage\s+hair\s*style)\b",
    re.I,
)
_OBJECTION_RE = re.compile(
    r"\b(?:expensive|ganak|loku\s+gana|too\s+much|budget|ikmanata|passe\s+kiyannam|"
    r"mata\s+therune\s+na|ගණන්\s*වැඩි|මිල\s*වැඩි|පස්සේ)\b",
    re.I,
)
_CLARIFY_RE = re.compile(
    r"\b(?:moka[kd]da|monawada|which\s+one|meaning|therenne\s+na|explain|"
    r"kohomada|කුමක්ද|මොකක්ද)\b",
    re.I,
)
_HANDOFF_RE = re.compile(
    r"\b(?:human|agent|manager|staff|person|real\s+person|talk\s+to\s+(?:someone|a)|"
    r"complaint|refund|පැමිණිල්ල|කාර්ය\s*මණ්ඩල)\b",
    re.I,
)
_STAFF_RE = re.compile(r"\b(?:stylist|staff|nadeeka|who\s+does|beautician)\b", re.I)
_DISCOUNT_RE = re.compile(r"\b(?:discount|offer|promo|package|වට්ටම්|පැකේජ්)\b", re.I)
_BOOK_RE = re.compile(
    r"\b(?:book|booking|appointment|reserve|schedule|slot|වෙන්|බුක්)\b",
    re.I,
)
_CANCEL_RE = re.compile(r"\b(?:cancel|අවලංගු)\b", re.I)
_RESCHED_RE = re.compile(r"\b(?:reschedule|postpone|වෙනස්\s*කර)\b", re.I)
_HOURS_RE = re.compile(r"\b(?:open|hours|closing|විවෘත|වේලා)\b", re.I)
_BRANCH_RE = re.compile(r"\b(?:branch|location|address|koheda|කොහෙද|where)\b", re.I)
_GREETING_RE = re.compile(
    r"^(?:hi+|hii+|hello|hey+|hai|ayo+|ayubowan|oii+|ආයුබෝවන්|வணக்கம்)[\s!.]*$",
    re.I,
)
_SERVICE_HINT_RE = re.compile(
    r"\b(?:keratin|botox|rebond|facial|wax|hair\s*cut|haircut|nail|bridal|"
    r"color|colour|highlight|manicure|pedicure|spa|massage|threading|"
    r"cleanup|clean-?up|dressing|treatment)\b",
    re.I,
)


@dataclass
class ConversationContext:
    """Structured per-turn context for Gemini + routing."""

    tenant_id: Optional[int] = None
    phone: Optional[str] = None
    conversation_id: Optional[int] = None

    current_intent: str = INTENT_GENERAL
    current_topic: Optional[str] = None  # service category / topic key
    last_customer_question: Optional[str] = None
    last_ai_response: Optional[str] = None
    discussed_services: list = field(default_factory=list)
    last_quoted_price: Optional[str] = None
    hair_length: Optional[str] = None
    customer_name: Optional[str] = None
    preferred_language: Optional[str] = None  # en|si|ta
    script_mode: Optional[str] = None
    booking_progress: Optional[str] = None  # flow state
    booking_paused: bool = False
    pending_booking_question: Optional[str] = None
    supplied_booking_fields: dict = field(default_factory=dict)
    objections: list = field(default_factory=list)
    unresolved_question: Optional[str] = None
    is_correction: bool = False
    is_topic_switch: bool = False
    has_media: bool = False
    emotion: Optional[str] = None  # urgency|confusion|objection|neutral
    decision: dict = field(default_factory=dict)
    must_answer: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _last_user_and_assistant(recent: Optional[list]) -> tuple[Optional[str], Optional[str]]:
    last_user = last_ai = None
    for m in recent or []:
        if not isinstance(m, dict):
            continue
        role = str(m.get("role") or "").lower()
        content = str(m.get("content") or "").strip()
        if not content:
            continue
        if role in ("user", "customer"):
            last_user = content
        elif role in ("assistant", "ai", "agent"):
            last_ai = content
    return last_user, last_ai


def _extract_services_from_text(text: str) -> list[str]:
    found = []
    for m in _SERVICE_HINT_RE.finditer(text or ""):
        s = m.group(0).lower().strip()
        if s not in found:
            found.append(s)
    return found


def _hair_length_from_text(text: str) -> Optional[str]:
    t = (text or "").lower()
    if re.search(r"\bbra\s*strap\b", t):
        return "bra_strap"
    if re.search(r"\bhip\b", t):
        return "hip"
    if re.search(r"\bshoulder\b", t):
        return "shoulder"
    if re.search(r"\b(?:short|කෙටි)\b", t):
        return "short"
    if re.search(r"\b(?:long|දිගු|ලොං)\b", t):
        return "long"
    return None


def _emotion_from_text(text: str) -> str:
    if _OBJECTION_RE.search(text or ""):
        if re.search(r"\bikmanata|urgent|asap|today\s+only\b", text or "", re.I):
            return "urgency"
        if re.search(r"\btherune\s*na|confused|තේරෙන්නේ\s*නැ\b", text or "", re.I):
            return "confusion"
        return "objection"
    if is_correction_message(text or ""):
        return "frustration"
    return "neutral"


def classify_intent(
    message: str,
    *,
    has_media: bool = False,
    memory: Optional[dict] = None,
    booking_state: Optional[str] = None,
    booking_paused: bool = False,
    prior_topic: Optional[str] = None,
) -> dict[str, Any]:
    """
    Context-aware intent classification (deterministic stand-in that Gemini
    is instructed to follow / refine via the decision block).
    """
    raw = (message or "").strip()
    t = raw.lower()
    mem = memory if isinstance(memory, dict) else {}

    if is_correction_message(raw):
        return {
            "intent": INTENT_CORRECTION,
            "topic": prior_topic or mem.get("last_service") or detect_service_category(raw),
            "must": (
                "Acknowledge the miss briefly, re-read the PRIOR customer question, "
                "and answer that original ask directly. Never send a generic welcome."
            ),
        }

    if is_media_message(raw, has_media=has_media):
        return {
            "intent": INTENT_IMAGE,
            "topic": prior_topic or detect_service_category(raw) or "hairstyle",
            "must": (
                "Look at the photo + any caption. Discuss style/colour/length. "
                "Never ask for an appointment date unless they clearly want to book."
            ),
        }

    if _HANDOFF_RE.search(raw) and re.search(
        r"\b(?:talk|speak|connect|want|need|please|complaint|refund)\b", t, re.I
    ):
        return {
            "intent": INTENT_HANDOFF,
            "topic": "handoff",
            "must": "Offer human handoff; summarise what they need for staff.",
        }

    if _CANCEL_RE.search(raw) and re.search(r"appointment|booking|appoinment|වෙන්", t, re.I):
        return {
            "intent": INTENT_CANCEL,
            "topic": "cancel",
            "must": "Help cancel — confirm which appointment, require explicit yes before tool.",
        }

    if _RESCHED_RE.search(raw):
        return {
            "intent": INTENT_RESCHEDULE,
            "topic": "reschedule",
            "must": "Help reschedule — pick appointment, new date/time, confirm before tool.",
        }

    if is_resume_booking_message(raw) and booking_state and booking_state != "idle":
        return {
            "intent": INTENT_BOOK_CONTINUE,
            "topic": mem.get("last_service") or prior_topic,
            "must": "Resume the pending booking step; do not restart from scratch.",
        }

    if _GREETING_RE.match(raw):
        return {
            "intent": INTENT_GREETING,
            "topic": None,
            "must": "Short friendly greeting + how you can help. No long pitch.",
        }

    if _BRANCH_RE.search(raw):
        return {
            "intent": INTENT_BRANCH,
            "topic": "location",
            "must": "Answer location/address/directions from salon data only.",
        }

    if _HOURS_RE.search(raw) and not _BOOK_RE.search(raw):
        return {
            "intent": INTENT_HOURS,
            "topic": "hours",
            "must": "Answer opening hours from salon data only.",
        }

    if _DISCOUNT_RE.search(raw):
        return {
            "intent": INTENT_DISCOUNT,
            "topic": "offers",
            "must": "Answer offers/packages from verified live data only.",
        }

    if _STAFF_RE.search(raw):
        return {
            "intent": INTENT_STAFF,
            "topic": "staff",
            "must": "Answer staff questions carefully; do not invent stylist availability.",
        }

    if _DURATION_RE.search(raw):
        cat = detect_service_category(raw) or prior_topic
        return {
            "intent": INTENT_DURATION,
            "topic": cat,
            "must": "Answer duration from live catalogue only; ask which service if unclear.",
        }

    if is_price_enquiry(raw) or (detect_service_category(raw) and re.search(r"mila|kiyada|price|cost|gana", t)):
        cat = detect_service_category(raw) or prior_topic or mem.get("last_service")
        return {
            "intent": INTENT_PRICE,
            "topic": cat,
            "must": (
                "Price from verified catalogue / official length tiers only. "
                "Never invent. Ask length when required."
            ),
        }

    if _RECOMMEND_RE.search(raw):
        return {
            "intent": INTENT_RECOMMEND,
            "topic": detect_service_category(raw) or prior_topic,
            "must": "Recommend only live-catalogue services; ask preference (e.g. smooth vs straight).",
        }

    if _OBJECTION_RE.search(raw):
        return {
            "intent": INTENT_OBJECTION,
            "topic": prior_topic or mem.get("last_service"),
            "must": "Acknowledge concern; offer verified lower-cost alternative if available; no pressure.",
        }

    if is_details_before_book(raw):
        return {
            "intent": INTENT_SERVICE,
            "topic": prior_topic or detect_service_category(raw) or mem.get("last_service"),
            "must": "Give service details first; do not push booking date/time yet.",
        }

    if _BOOK_RE.search(raw) and not is_details_before_book(raw):
        if booking_state and booking_state not in ("idle", None) and not booking_paused:
            return {
                "intent": INTENT_BOOK_CONTINUE,
                "topic": mem.get("last_service") or prior_topic,
                "must": "Continue booking at the current step.",
            }
        return {
            "intent": INTENT_BOOK,
            "topic": detect_service_category(raw) or prior_topic or mem.get("last_service"),
            "must": "Help book; collect missing details one at a time; never claim success without backend confirm.",
        }

    if booking_paused and booking_state and booking_state != "idle":
        # New ask while paused — treat as topic content, not forced booking
        cat = detect_service_category(raw)
        if cat or is_faq_message(raw) or is_catalogue_ask(raw):
            return {
                "intent": INTENT_SERVICE if cat else INTENT_GENERAL,
                "topic": cat or prior_topic,
                "must": "Answer this new question first; booking stays paused until they continue.",
            }

    if detect_service_category(raw) or _SERVICE_HINT_RE.search(raw):
        cat = detect_service_category(raw)
        return {
            "intent": INTENT_SERVICE,
            "topic": cat,
            "must": f"Answer about {cat or 'the named service'} from live data only.",
        }

    if is_catalogue_ask(raw):
        return {
            "intent": INTENT_SERVICE,
            "topic": detect_service_category(raw),
            "must": "Show matching categories/services for what they asked — not unrelated rows.",
        }

    if _CLARIFY_RE.search(raw) and prior_topic:
        return {
            "intent": INTENT_CLARIFY,
            "topic": prior_topic,
            "must": f"Clarify the previous topic ({prior_topic}) in simpler language.",
        }

    # Continuation: short reply with prior topic (e.g. "Bra Strap", "Saturday")
    if prior_topic and len(raw.split()) <= 6 and not _GREETING_RE.match(raw):
        if _hair_length_from_text(raw) or re.search(
            r"\b(?:today|tomorrow|heta|saturday|sunday|monday|ade|හෙට|අද)\b", t, re.I
        ):
            return {
                "intent": INTENT_BOOK_CONTINUE if booking_state not in (None, "idle") else INTENT_PRICE,
                "topic": prior_topic,
                "must": (
                    f"Continue the prior topic ({prior_topic}) with this short answer "
                    "(length / date). Do not ask which service again."
                ),
            }

    return {
        "intent": INTENT_GENERAL,
        "topic": prior_topic or mem.get("last_service"),
        "must": "Read THIS message carefully and answer exactly what they asked.",
    }


def detect_topic_switch(
    message: str,
    *,
    prior_topic: Optional[str],
    new_topic: Optional[str],
    intent: str,
) -> bool:
    if intent in (INTENT_CORRECTION, INTENT_IMAGE, INTENT_HANDOFF, INTENT_GREETING):
        return intent == INTENT_CORRECTION
    if not prior_topic or not new_topic:
        return False
    a = str(prior_topic).lower().strip()
    b = str(new_topic).lower().strip()
    if a == b:
        return False
    # normalize rough aliases
    aliases = {
        "keratin": "treatment",
        "botox": "treatment",
        "rebond": "treatment",
        "haircut": "haircut",
        "hair cut": "haircut",
    }
    aa = aliases.get(a, a)
    bb = aliases.get(b, b)
    return aa != bb


def build_conversation_context(
    *,
    message: str,
    tenant_id: Optional[int] = None,
    phone: Optional[str] = None,
    conversation_id: Optional[int] = None,
    customer_name: Optional[str] = None,
    recent_messages: Optional[list] = None,
    memory: Optional[dict] = None,
    booking_state: Optional[str] = None,
    booking_paused: bool = False,
    booking_draft: Optional[dict] = None,
    has_media: bool = False,
    script_mode: Optional[str] = None,
    reply_lang: Optional[str] = None,
) -> ConversationContext:
    mem = memory if isinstance(memory, dict) else {}
    last_user, last_ai = _last_user_and_assistant(recent_messages)
    prior_topic = (
        mem.get("current_topic")
        or mem.get("last_service")
        or detect_service_category(last_ai or "")
        or detect_service_category(last_user or "")
    )

    classified = classify_intent(
        message,
        has_media=has_media,
        memory=mem,
        booking_state=booking_state,
        booking_paused=booking_paused,
        prior_topic=prior_topic,
    )
    intent = classified["intent"]
    topic = classified.get("topic")
    topic_switch = detect_topic_switch(
        message, prior_topic=prior_topic, new_topic=topic, intent=intent
    )

    services = list(mem.get("preferred_services") or [])
    for s in _extract_services_from_text(message):
        if s not in services:
            services.insert(0, s)
    services = services[:12]

    hair = _hair_length_from_text(message) or mem.get("hair_length")
    emotion = _emotion_from_text(message)
    lang = reply_lang or mem.get("language") or detect_lang(message) or "en"
    sm = script_mode or mem.get("script_mode") or detect_script_mode(message)

    draft = booking_draft if isinstance(booking_draft, dict) else {}
    pending_q = None
    if booking_state == "await_date":
        pending_q = "date"
    elif booking_state == "await_time":
        pending_q = "time"
    elif booking_state == "await_name":
        pending_q = "name"
    elif booking_state == "await_confirm":
        pending_q = "confirm"
    elif booking_state == "await_service":
        pending_q = "service"

    unresolved = None
    if intent == INTENT_CORRECTION:
        unresolved = last_user
    elif booking_paused:
        unresolved = message[:200]

    decision = evaluate_response_decision(
        intent=intent,
        topic=topic,
        topic_switch=topic_switch,
        booking_state=booking_state,
        booking_paused=booking_paused,
        has_media=has_media,
        is_correction=(intent == INTENT_CORRECTION),
        emotion=emotion,
        needs_verified_price=(intent == INTENT_PRICE),
        needs_backend_action=intent
        in (INTENT_BOOK, INTENT_BOOK_CONTINUE, INTENT_CANCEL, INTENT_RESCHEDULE),
    )

    return ConversationContext(
        tenant_id=tenant_id,
        phone=phone,
        conversation_id=conversation_id,
        current_intent=intent,
        current_topic=topic or prior_topic,
        last_customer_question=last_user,
        last_ai_response=(last_ai[:240] if last_ai else None),
        discussed_services=services,
        last_quoted_price=mem.get("last_quoted_price"),
        hair_length=hair,
        customer_name=customer_name or mem.get("customer_name"),
        preferred_language=lang,
        script_mode=sm,
        booking_progress=booking_state,
        booking_paused=bool(booking_paused),
        pending_booking_question=pending_q,
        supplied_booking_fields={
            k: draft.get(k)
            for k in ("service_name", "date", "time", "name", "phone")
            if draft.get(k)
        },
        objections=[mem.get("objections")] if mem.get("objections") else [],
        unresolved_question=unresolved,
        is_correction=(intent == INTENT_CORRECTION),
        is_topic_switch=topic_switch,
        has_media=has_media,
        emotion=emotion,
        decision=decision,
        must_answer=str(classified.get("must") or ""),
    )


def evaluate_response_decision(
    *,
    intent: str,
    topic: Optional[str],
    topic_switch: bool,
    booking_state: Optional[str],
    booking_paused: bool,
    has_media: bool,
    is_correction: bool,
    emotion: str,
    needs_verified_price: bool,
    needs_backend_action: bool,
) -> dict[str, Any]:
    """
    Internal decision process (V2 §17) — not shown to customer; guides Gemini.
    Priority: latest ask > context > pending booking > fallback.
    """
    action = "direct_answer"
    if is_correction:
        action = "correct_and_reanswer"
    elif has_media:
        action = "analyze_media"
    elif intent == INTENT_HANDOFF:
        action = "handoff"
    elif intent in (INTENT_CANCEL, INTENT_RESCHEDULE):
        action = "booking_tool_flow"
    elif intent == INTENT_BOOK_CONTINUE and not booking_paused:
        action = "booking_tool_flow"
    elif intent == INTENT_BOOK and not booking_paused:
        action = "booking_tool_flow"
    elif needs_verified_price:
        action = "verified_price"
    elif intent == INTENT_CLARIFY:
        action = "clarify"
    elif intent == INTENT_OBJECTION:
        action = "acknowledge_objection"
    elif intent == INTENT_RECOMMEND:
        action = "recommend_verified"
    elif topic_switch:
        action = "answer_new_topic"

    return {
        "action": action,
        "priority": "latest_ask_first",
        "topic": topic,
        "topic_switch": topic_switch,
        "booking_state": booking_state,
        "booking_paused": booking_paused,
        "emotion": emotion,
        "needs_verified_price": needs_verified_price,
        "needs_backend_action": needs_backend_action,
        "rules": [
            "Answer the actual latest customer ask first.",
            "Never invent salon prices or claim booking/cancel success without backend confirmation.",
            "If booking is paused, keep draft; resume only on continue or clear step answer.",
            "Match language/script_mode; no random language switch.",
            "One relevant question at a time.",
        ],
    }


def format_context_for_prompt(ctx: ConversationContext) -> str:
    """Compact block injected into Gemini system prompt."""
    d = ctx.decision or {}
    lines = [
        "CONVERSATION CONTEXT (structured — obey):",
        f"- Intent: {ctx.current_intent}",
        f"- Topic: {ctx.current_topic or '—'}",
        f"- Decision action: {d.get('action')}",
        f"- Must answer: {ctx.must_answer}",
        f"- Style: {lang_label(ctx.preferred_language or 'en', ctx.script_mode)}",
        f"- Emotion: {ctx.emotion or 'neutral'}",
        f"- Topic switch: {'yes' if ctx.is_topic_switch else 'no'}",
        f"- Correction: {'yes' if ctx.is_correction else 'no'}",
        f"- Media: {'yes' if ctx.has_media else 'no'}",
        f"- Booking progress: {ctx.booking_progress or 'idle'}"
        f"{' (PAUSED — answer new ask first)' if ctx.booking_paused else ''}",
    ]
    if ctx.pending_booking_question:
        lines.append(f"- Pending booking question (do not force): {ctx.pending_booking_question}")
    if ctx.supplied_booking_fields:
        bits = ", ".join(f"{k}={v}" for k, v in ctx.supplied_booking_fields.items())
        lines.append(f"- Already known booking fields: {bits}")
    if ctx.discussed_services:
        lines.append(f"- Discussed services: {', '.join(str(s) for s in ctx.discussed_services[:8])}")
    if ctx.hair_length:
        lines.append(f"- Hair length: {ctx.hair_length}")
    if ctx.last_quoted_price:
        lines.append(f"- Last quoted verified price: {ctx.last_quoted_price}")
    if ctx.last_customer_question:
        lines.append(f"- Prior customer question: {ctx.last_customer_question[:180]}")
    if ctx.unresolved_question:
        lines.append(f"- Unresolved / to re-answer: {ctx.unresolved_question[:180]}")
    if ctx.objections:
        lines.append(f"- Objections: {str(ctx.objections[0])[:120]}")
    lines.append(
        "Priority: latest customer request > conversation context > pending booking > generic help."
    )
    return "\n".join(lines)


def memory_patch_from_context(ctx: ConversationContext) -> dict[str, Any]:
    """Fields safe to merge into CrmAiMemory.meta / preferred_services."""
    return {
        "current_topic": ctx.current_topic,
        "last_intent": ctx.current_intent,
        "script_mode": ctx.script_mode,
        "language": ctx.preferred_language,
        "hair_length": ctx.hair_length,
        "booking_state": ctx.booking_progress,
        "booking_paused": ctx.booking_paused,
        "last_service": ctx.current_topic or (ctx.discussed_services[0] if ctx.discussed_services else None),
        "unresolved_question": ctx.unresolved_question,
        "last_quoted_price": ctx.last_quoted_price,
        "preferred_services": ctx.discussed_services[:12],
    }
