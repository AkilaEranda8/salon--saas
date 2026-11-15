"""RC5 — Gemini human-understanding engine (referents, emotion, context)."""
from __future__ import annotations

from app.conversation_intelligence import (
    INTENT_ALTERNATIVE,
    INTENT_CONCERN,
    INTENT_PRICE,
    INTENT_RECOMMEND,
    build_conversation_context,
    classify_intent,
    format_context_for_prompt,
    is_referent_message,
    resolve_referent_topic,
)
from app.pricing_resolver import is_price_enquiry


def test_eka_is_referent():
    assert is_referent_message("Eka keeyada?") is True
    assert is_referent_message("kalina eka") is True
    assert is_referent_message("Keratin treatment price?") is False


def test_resolve_eka_from_memory():
    topic = resolve_referent_topic(
        "Eka keeyada?",
        memory={"last_service": "keratin", "current_topic": "keratin"},
    )
    assert topic == "keratin"


def test_eka_keeyada_price_intent():
    c = classify_intent(
        "Eka keeyada?",
        memory={"last_service": "keratin"},
        prior_topic="keratin",
    )
    assert c["intent"] == INTENT_PRICE
    assert c["topic"] == "keratin"
    assert is_price_enquiry("Eka keeyada?") is True


def test_eka_karanna_hodaida_advice():
    c = classify_intent(
        "Eka karanna hodaida?",
        memory={"last_service": "keratin"},
        prior_topic="keratin",
    )
    assert c["intent"] == INTENT_RECOMMEND
    assert c["topic"] == "keratin"


def test_ane_mata_eka_baya_concern():
    c = classify_intent(
        "Ane mata eka baya",
        memory={"last_service": "rebond"},
        prior_topic="rebond",
    )
    assert c["intent"] == INTENT_CONCERN
    assert c.get("referent_topic") == "rebond"


def test_ehenam_wena_ekak_alternative():
    c = classify_intent(
        "Ehenam wena ekak kiyanna",
        memory={"last_service": "keratin"},
        prior_topic="keratin",
    )
    assert c["intent"] == INTENT_ALTERNATIVE


def test_emotion_fear_and_hesitation():
    ctx = build_conversation_context(
        message="Ane mata eka baya",
        memory={"last_service": "keratin", "current_topic": "keratin"},
    )
    assert ctx.emotion == "fear"
    assert ctx.referent_topic == "keratin"
    block = format_context_for_prompt(ctx)
    assert "keratin" in block.lower()
    assert "Referent" in block or "eka" in block.lower()


def test_context_does_not_reset_on_hari():
    ctx = build_conversation_context(
        message="hari",
        memory={"last_service": "facial", "current_topic": "facial"},
        booking_state="idle",
    )
    # short ack should keep facial topic available
    assert (ctx.current_topic or "").lower().find("facial") >= 0 or ctx.current_topic == "facial"


def test_booking_paused_new_ask_priority():
    ctx = build_conversation_context(
        message="Salon eka koheda?",
        memory={"last_service": "keratin"},
        booking_state="await_date",
        booking_paused=True,
    )
    assert ctx.booking_paused is True
    assert ctx.current_intent in ("branch_information", "general", "service_enquiry")
    # must not force booking continue
    assert ctx.decision.get("action") != "booking_tool_flow"
