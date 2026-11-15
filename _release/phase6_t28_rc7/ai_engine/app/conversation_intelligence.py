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
INTENT_CONCERN = "customer_concern"
INTENT_ALTERNATIVE = "alternative_request"
INTENT_COMPLIMENT = "compliment"


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
_REFERENT_RE = re.compile(
    r"\b(?:eka|ehema|ehemada|ekath|ekema|eya|"
    r"kalin(?:a)?\s+eka|kalina\s+eka|passe\s+eka|me\s+eka|that\s+one|the\s+one|"
    r"wena\s+eka|wenath\s+eka|wenna\s+eka|"
    r"ඒක|එක|කලින්\s*එක)\b",
    re.I,
)
_ADVICE_RE = re.compile(
    r"\b(?:hodaida|hodai\s*da|hodada|hondaida|suitable|recommend|karanna\s+hoda|"
    r"karanna\s+honda|worth\s+it|should\s+i|mata\s+hari|mokakda\s+hoda|"
    r"oya\s+recommend|හොඳද|හොඳයිද)\b",
    re.I,
)
_REJECT_PRIOR_RE = re.compile(
    r"\b(?:ehema\s+nam\s+epa|ehema\s+epa|eka\s+epa|that\s+one\s+no|"
    r"mata\s+hithenne\s+wena|hithenne\s+wena|not\s+that)\b",
    re.I,
)
_CHEAPER_RE = re.compile(
    r"\b(?:mita\s+wada\s+adu|adu\s+eka|cheaper|less\s+expensive|ganak|"
    r"ganan\s+wadi|budget)\b",
    re.I,
)
_CONCERN_RE = re.compile(
    r"\b(?:baya|bayai|scared|afraid|worry|worried|nervous|hesitat|"
    r"mata\s+e?ka\s+baya|ane\s+|damage|side\s*effect|"
    r"බය|බයයි)\b",
    re.I,
)
_ALTERNATIVE_RE = re.compile(
    r"\b(?:wena\s+eka|wenath\s+eka|wenna\s+eka|another\s+one|alternative|"
    r"wena\s+ekak|other\s+(?:one|option|service)|"
    r"ehenam\s+wena|then\s+another)\b",
    re.I,
)
_COMPLIMENT_RE = re.compile(
    r"\b(?:supiri|godak\s+honda|thank(?:s|you)?|istuti|sthuthi|"
    r"nice|great|awesome|love\s+it|පින්|ස්තුති)\b",
    re.I,
)
_HESITATION_RE = re.compile(
    r"\b(?:balamu|balannam|passe|passe\s+kiyannam|dan\s+ne|danne\s+na|"
    r"hithanawa|think(?:ing)?|maybe|maybe\s+later|මම\s+බලමු)\b",
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
_INCOMPLETE_RE = re.compile(
    r"^(?:eka|ehema|hari|ow|hmm+|hm+|ane+|aththa|then|and|but|so|"
    r"mata|oyata|meka|ඒක|හරි)[\s?.!]*$",
    re.I,
)
_IMPLICIT_BOOK_RE = re.compile(
    r"\b(?:free\s*(?:da|tha)|slot\s*(?:thiyen|available)|"
    r"kalata\s+enna|enawa|come\s+tomorrow|heta\s+enna)\b",
    re.I,
)
_COMMITMENT_RE = re.compile(
    r"\b(?:i\s+(?:will|ll)\s+|mama\s+(?:enawa|karannam)|balamu|"
    r"passe\s+kiyannam|call\s+(?:you|me)|confirm\s+karannam)\b",
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
    emotion: Optional[str] = None  # fear|hesitation|appreciation|urgency|confusion|objection|neutral
    referent_topic: Optional[str] = None  # resolved "eka" / prior service
    decision: dict = field(default_factory=dict)
    must_answer: str = ""
    # RC7 advanced memory fields
    conversation_summary: Optional[str] = None
    pending_questions: list = field(default_factory=list)
    commitments: list = field(default_factory=list)
    is_incomplete: bool = False
    is_implicit: bool = False
    stale_context_blocked: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def is_incomplete_utterance(text: str) -> bool:
    """Short / trailing fragments that need conversation context to interpret."""
    raw = (text or "").strip()
    if not raw:
        return True
    if len(raw.split()) <= 2 and _INCOMPLETE_RE.match(raw):
        return True
    if raw.endswith(("...", "…", " and", " but", " so")) and len(raw.split()) <= 6:
        return True
    return False


def is_implicit_request(text: str) -> bool:
    """Implied booking/availability without explicit 'book' keyword."""
    return bool(_IMPLICIT_BOOK_RE.search(text or ""))


def extract_commitment(text: str) -> Optional[str]:
    raw = (text or "").strip()
    if not raw or not _COMMITMENT_RE.search(raw):
        return None
    return raw[:160]


def build_conversation_summary(
    *,
    memory: Optional[dict] = None,
    ctx_topic: Optional[str] = None,
    intent: Optional[str] = None,
    last_user: Optional[str] = None,
) -> str:
    """Compact rolling summary for prompt + CRM meta (no secrets)."""
    mem = memory if isinstance(memory, dict) else {}
    bits: list[str] = []
    prior = mem.get("conversation_summary") or mem.get("summary")
    if prior:
        bits.append(str(prior)[:220])
    if ctx_topic:
        bits.append(f"topic={ctx_topic}")
    if intent:
        bits.append(f"intent={intent}")
    if last_user:
        bits.append(f"last_ask={str(last_user)[:80]}")
    prefs = mem.get("preferred_services")
    if isinstance(prefs, list) and prefs:
        bits.append("services=" + ",".join(str(p) for p in prefs[:4]))
    return " · ".join(bits)[:480]


def apply_stale_context_guard(
    *,
    message: str,
    prior_topic: Optional[str],
    new_topic: Optional[str],
    intent: str,
) -> tuple[Optional[str], bool]:
    """
    Prevent stale memory topic from overriding a clear new ask.
    Returns (effective_topic, stale_blocked).
    """
    if new_topic and prior_topic and detect_topic_switch(
        message, prior_topic=prior_topic, new_topic=new_topic, intent=intent
    ):
        return new_topic, True
    # Explicit new category in message wins over memory
    msg_cat = detect_service_category(message or "")
    if msg_cat and prior_topic and msg_cat != prior_topic:
        return msg_cat, True
    return new_topic or prior_topic, False


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
    raw = text or ""
    if _CONCERN_RE.search(raw):
        return "fear"
    if _COMPLIMENT_RE.search(raw) and len(raw.split()) <= 8:
        return "appreciation"
    if _HESITATION_RE.search(raw):
        return "hesitation"
    if _OBJECTION_RE.search(raw):
        if re.search(r"\bikmanata|urgent|asap|today\s+only\b", raw, re.I):
            return "urgency"
        if re.search(r"\btherune\s*na|confused|තේරෙන්නේ\s*නැ\b", raw, re.I):
            return "confusion"
        return "objection"
    if is_correction_message(raw):
        return "frustration"
    if re.search(r"\btherune\s*na|confused|තේරෙන්නේ\s*නැ|monawada\s+kiyann[eé]\b", raw, re.I):
        return "confusion"
    return "neutral"


def is_referent_message(text: str) -> bool:
    """True when the message leans on a prior topic pronoun (eka / kalina eka / …)."""
    t = (text or "").strip()
    if not t:
        return False
    if not _REFERENT_RE.search(t):
        return False
    # Explicit new service name → not pure referent
    if detect_service_category(t) and not re.search(
        r"\b(?:eka|ehema|kalin|kalina|that\s+one|the\s+one|ඒක)\b", t, re.I
    ):
        return False
    return True


def resolve_referent_topic(
    message: str,
    *,
    memory: Optional[dict] = None,
    prior_topic: Optional[str] = None,
    recent_messages: Optional[list] = None,
) -> Optional[str]:
    """Resolve what 'eka' / 'kalina eka' refers to from memory + recent chat."""
    mem = memory if isinstance(memory, dict) else {}
    if prior_topic:
        return str(prior_topic)
    for field in ("current_topic", "last_service", "last_quoted_service"):
        v = mem.get(field)
        if isinstance(v, str) and v.strip():
            return v.strip()
        if isinstance(v, list) and v:
            return str(v[0]).strip() or None
    prefs = mem.get("preferred_services")
    if isinstance(prefs, list) and prefs:
        return str(prefs[0]).strip() or None
    last_user, last_ai = _last_user_and_assistant(recent_messages)
    for blob in (last_ai, last_user):
        cat = detect_service_category(blob or "")
        if cat:
            return cat
        for s in _extract_services_from_text(blob or ""):
            return s
    return None


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

    # Resolve "eka" / "kalina eka" / "ehema" against prior topic before other routing
    referent_topic = None
    if is_referent_message(raw) or (
        len(raw.split()) <= 8 and _REFERENT_RE.search(raw) and (prior_topic or mem.get("last_service"))
    ):
        referent_topic = resolve_referent_topic(
            raw, memory=mem, prior_topic=prior_topic
        ) or prior_topic or mem.get("last_service")

    if (_ALTERNATIVE_RE.search(raw) or _REJECT_PRIOR_RE.search(raw) or _CHEAPER_RE.search(raw)) and (
        referent_topic or prior_topic or mem.get("last_service")
    ):
        topic = referent_topic or prior_topic or mem.get("last_service")
        cheaper = bool(_CHEAPER_RE.search(raw))
        return {
            "intent": INTENT_ALTERNATIVE,
            "topic": topic,
            "must": (
                f"Customer wants an ALTERNATIVE to {topic}"
                + (" that is lower cost / better value" if cheaper else "")
                + ". Suggest 1–2 verified catalogue alternatives with honest differences; "
                "never invent discounts; no pressure to book."
            ),
            "referent_topic": topic,
        }

    if _CONCERN_RE.search(raw) and (referent_topic or prior_topic or mem.get("last_service") or _REFERENT_RE.search(raw)):
        topic = referent_topic or prior_topic or mem.get("last_service")
        return {
            "intent": INTENT_CONCERN,
            "topic": topic,
            "must": (
                f"Customer is worried/scared about {topic or 'the discussed service'}. "
                "Empathise first, give honest guidance from verified knowledge, never dismiss fear, "
                "offer staff confirmation if unsure. Do not force booking."
            ),
            "referent_topic": topic,
        }

    if (_ADVICE_RE.search(raw) or _RECOMMEND_RE.search(raw)) and (
        referent_topic or prior_topic or mem.get("last_service")
    ) and is_referent_message(raw):
        topic = referent_topic or prior_topic or mem.get("last_service")
        return {
            "intent": INTENT_RECOMMEND,
            "topic": topic,
            "must": (
                f"Advise honestly whether {topic} suits them, using verified salon knowledge only. "
                "Answer the advice ask first — do not pitch booking unless they ask."
            ),
            "referent_topic": topic,
        }

    if _COMPLIMENT_RE.search(raw) and len(raw.split()) <= 6:
        return {
            "intent": INTENT_COMPLIMENT,
            "topic": prior_topic or mem.get("last_service"),
            "must": "Acknowledge warmly in one short line; ask how else you can help — no long pitch.",
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
        cat = detect_service_category(raw) or referent_topic or prior_topic or mem.get("last_service")
        return {
            "intent": INTENT_DURATION,
            "topic": cat,
            "must": (
                f"Answer duration for {cat or 'the discussed service'} from live catalogue only; "
                "if they said 'eka', use prior topic — do not re-ask which service when known."
            ),
            "referent_topic": referent_topic or cat,
        }

    if is_price_enquiry(raw) or (detect_service_category(raw) and re.search(r"mila|kiyada|keeyada|price|cost|gana", t)):
        cat = (
            detect_service_category(raw)
            or referent_topic
            or prior_topic
            or mem.get("last_service")
        )
        return {
            "intent": INTENT_PRICE,
            "topic": cat,
            "must": (
                f"Price for {cat or 'the discussed service'} from verified catalogue / length tiers only. "
                "If they said 'eka', use the prior discussed service — never ask which service again if known. "
                "Never invent. Ask length when required."
            ),
            "referent_topic": referent_topic or cat,
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

    # Pure referent follow-up with prior topic ("eka?", "hari eka", "kalina eka")
    if referent_topic and is_referent_message(raw) and len(raw.split()) <= 10:
        return {
            "intent": INTENT_CLARIFY,
            "topic": referent_topic,
            "must": (
                f"They referred to prior topic ({referent_topic}) with a short pronoun. "
                "Answer about THAT topic using history — never treat as a brand-new ask."
            ),
            "referent_topic": referent_topic,
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

    if _HESITATION_RE.search(raw) and (prior_topic or mem.get("last_service")):
        return {
            "intent": INTENT_OBJECTION,
            "topic": prior_topic or mem.get("last_service"),
            "must": "Respect hesitation; soft check-in only — no booking pressure.",
            "referent_topic": prior_topic or mem.get("last_service"),
        }

    # Implicit availability / visit intent without saying "book"
    if is_implicit_request(raw):
        return {
            "intent": INTENT_BOOK if not (booking_state and booking_state != "idle") else INTENT_BOOK_CONTINUE,
            "topic": detect_service_category(raw) or referent_topic or prior_topic or mem.get("last_service"),
            "must": (
                "Customer implied they want a slot / to come in — help with availability or booking. "
                "Do not claim a booking without backend confirmation."
            ),
            "implicit": True,
            "referent_topic": referent_topic,
        }

    # Incomplete short fragment — lean on prior topic rather than resetting
    if is_incomplete_utterance(raw) and (referent_topic or prior_topic or mem.get("last_service")):
        topic = referent_topic or prior_topic or mem.get("last_service")
        return {
            "intent": INTENT_CLARIFY,
            "topic": topic,
            "must": (
                f"Incomplete short message — interpret using prior topic ({topic}) and recent chat. "
                "Ask at most one clarifying question if still ambiguous."
            ),
            "incomplete": True,
            "referent_topic": topic,
        }

    return {
        "intent": INTENT_GENERAL,
        "topic": prior_topic or mem.get("last_service"),
        "must": "Read THIS message carefully and answer exactly what they asked — use conversation history for pronouns like eka.",
        "referent_topic": referent_topic,
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
    referent_topic = classified.get("referent_topic") or (
        resolve_referent_topic(message, memory=mem, prior_topic=prior_topic, recent_messages=recent_messages)
        if is_referent_message(message)
        else None
    )
    if not topic and referent_topic:
        topic = referent_topic
    topic_switch = detect_topic_switch(
        message, prior_topic=prior_topic, new_topic=topic, intent=intent
    )
    topic, stale_blocked = apply_stale_context_guard(
        message=message,
        prior_topic=prior_topic,
        new_topic=topic,
        intent=intent,
    )
    if stale_blocked:
        topic_switch = True

    services = list(mem.get("preferred_services") or [])
    for s in _extract_services_from_text(message):
        if s not in services:
            services.insert(0, s)
    services = services[:12]

    hair = _hair_length_from_text(message) or mem.get("hair_length")
    emotion = _emotion_from_text(message)
    lang = reply_lang or mem.get("language") or detect_lang(message) or "en"
    sm = script_mode or mem.get("script_mode") or detect_script_mode(message)
    incomplete = bool(classified.get("incomplete")) or is_incomplete_utterance(message)
    implicit = bool(classified.get("implicit")) or is_implicit_request(message)

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

    pending_questions = list(mem.get("pending_questions") or [])
    if pending_q and f"booking_{pending_q}" not in pending_questions:
        pending_questions = [f"booking_{pending_q}"] + pending_questions
    if incomplete and topic and "clarify_prior_topic" not in pending_questions:
        pending_questions.insert(0, "clarify_prior_topic")
    pending_questions = pending_questions[:8]

    commitments = list(mem.get("commitments") or [])
    cust_commit = extract_commitment(message)
    if cust_commit:
        commitments = [f"customer:{cust_commit}"] + commitments
    commitments = commitments[:8]

    summary = build_conversation_summary(
        memory=mem,
        ctx_topic=topic or prior_topic,
        intent=intent,
        last_user=message,
    )

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
    if emotion in ("fear", "hesitation") and decision.get("action") == "direct_answer":
        decision["action"] = "empathise_then_answer"
        decision["rules"] = list(decision.get("rules") or []) + [
            "Empathise in one short beat before the factual answer.",
        ]
    if incomplete:
        decision["rules"] = list(decision.get("rules") or []) + [
            "Message looks incomplete — use referent/memory; one clarifying question max.",
        ]
    if implicit:
        decision["rules"] = list(decision.get("rules") or []) + [
            "Implicit request detected — address availability/booking softly without fake confirm.",
        ]
    if stale_blocked:
        decision["rules"] = list(decision.get("rules") or []) + [
            "Stale prior topic blocked — answer the NEW topic only.",
        ]

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
        referent_topic=referent_topic or (topic if is_referent_message(message) else None),
        decision=decision,
        must_answer=str(classified.get("must") or ""),
        conversation_summary=summary,
        pending_questions=pending_questions,
        commitments=commitments,
        is_incomplete=incomplete,
        is_implicit=implicit,
        stale_context_blocked=stale_blocked,
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
        f"- Referent ('eka'/prior): {ctx.referent_topic or '—'}",
        f"- Topic switch: {'yes' if ctx.is_topic_switch else 'no'}",
        f"- Correction: {'yes' if ctx.is_correction else 'no'}",
        f"- Media: {'yes' if ctx.has_media else 'no'}",
        f"- Booking progress: {ctx.booking_progress or 'idle'}"
        f"{' (PAUSED — answer new ask first)' if ctx.booking_paused else ''}",
    ]
    if ctx.referent_topic:
        lines.append(
            f"- When they say eka/ehema/kalina eka → they mean: {ctx.referent_topic}"
        )
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
    if ctx.conversation_summary:
        lines.append(f"- Summary: {ctx.conversation_summary[:220]}")
    if ctx.pending_questions:
        lines.append(f"- Pending questions: {', '.join(str(p) for p in ctx.pending_questions[:5])}")
    if ctx.commitments:
        lines.append(f"- Commitments: {', '.join(str(c) for c in ctx.commitments[:4])}")
    if ctx.is_incomplete:
        lines.append("- Incomplete utterance: yes — use referent/memory")
    if ctx.is_implicit:
        lines.append("- Implicit request: yes")
    if ctx.stale_context_blocked:
        lines.append("- Stale context blocked: use NEW topic only")
    if not ctx.has_media:
        lines.append("- Media: none this turn — never claim you saw a photo/heard audio")
    lines.append(
        "Priority: latest customer request > conversation context > pending booking > generic help."
    )
    lines.append(
        "Multi-intent: if several questions appear, answer EACH verified part in one reply — never drop secondary asks."
    )
    return "\n".join(lines)


def memory_patch_from_context(ctx: ConversationContext) -> dict[str, Any]:
    """Fields safe to merge into CrmAiMemory.meta / preferred_services."""
    from app.response_quality import scrub_sensitive_memory

    patch = {
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
        "conversation_summary": ctx.conversation_summary,
        "pending_questions": list(ctx.pending_questions or [])[:8],
        "commitments": list(ctx.commitments or [])[:8],
        "emotion": ctx.emotion,
        "tenant_id": ctx.tenant_id,  # isolation hint for CRM layer
    }
    return scrub_sensitive_memory(patch)
