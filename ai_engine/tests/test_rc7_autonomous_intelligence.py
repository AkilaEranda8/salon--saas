"""RC7 — planner, advanced memory, quality upgrades, trace (deterministic)."""
from __future__ import annotations

from app.conversation_intelligence import (
    build_conversation_context,
    classify_intent,
    is_incomplete_utterance,
    is_implicit_request,
    apply_stale_context_guard,
    memory_patch_from_context,
)
from app.response_quality import (
    scrub_sensitive_memory,
    validate_customer_reply,
)
from app.turn_planner import build_turn_plan, MAX_TOOL_STEPS
from app.turn_trace import TurnTrace, new_trace_id, redact_phone


def test_incomplete_and_implicit():
    assert is_incomplete_utterance("eka")
    assert is_incomplete_utterance("hari")
    assert is_implicit_request("heta free da?")
    c = classify_intent("eka", prior_topic="keratin", memory={"last_service": "keratin"})
    assert c["topic"] == "keratin"
    assert c.get("incomplete") or c["intent"]


def test_stale_context_blocked_on_topic_switch():
    topic, blocked = apply_stale_context_guard(
        message="Mata facial ekak oni",
        prior_topic="keratin",
        new_topic="facial",
        intent="service_enquiry",
    )
    assert topic == "facial"
    assert blocked is True


def test_memory_patch_has_rc7_fields_and_scrubs_secrets():
    ctx = build_conversation_context(
        message="Keratin eka keeyada?",
        tenant_id=28,
        memory={"last_service": "keratin", "api_key": "SHOULD_NOT_LEAK"},
    )
    patch = memory_patch_from_context(ctx)
    assert "conversation_summary" in patch
    assert "pending_questions" in patch or "commitments" in patch
    assert "api_key" not in scrub_sensitive_memory({"api_key": "x", "last_service": "keratin"})


def test_planner_bounded_and_marks_confirm():
    ctx = build_conversation_context(
        message="Book karanna heta 10am",
        tenant_id=28,
        memory={"last_service": "haircut"},
    )
    plan = build_turn_plan(message="Book karanna heta 10am", ctx=ctx)
    assert len(plan.selected_tools) <= MAX_TOOL_STEPS
    assert plan.require_customer_confirm is True
    assert len(plan.steps) == 9
    d = plan.to_action()
    assert d["tool"] == "turn_planner"


def test_quality_media_claim_without_media():
    rep = validate_customer_reply(
        "Haircut kiyada?",
        "I can see your photo — Butterfly looks great. Rs 4500.",
        has_media=False,
        price_hard_gated=True,
    )
    assert rep.media_claim_without_media is True
    assert rep.ok is False


def test_quality_language_and_health():
    rep = validate_customer_reply(
        "මට කෙරටින් එකක් ඕනේ. මිල කීයද?",
        "Sure! Let me walk you through our entire premium menu in exhaustive detail about unrelated spa packages and wedding packages only.",
        prior_topic="keratin",
    )
    # Missing verified amount + likely language mismatch on long English-only reply
    assert rep.ok is False
    assert "price_keratin" in rep.missing or rep.language_mismatch

    bad = validate_customer_reply(
        "Mage skin eka mehema",
        "You have eczema — please treat with steroid cream.",
        has_media=True,
    )
    assert "health_diagnosis_forbidden" in bad.missing


def test_trace_redacts_phone_and_strips_secrets():
    assert redact_phone("94771234567") == "***4567"
    t = TurnTrace(trace_id=new_trace_id(), tenant_id=28, phone_redacted=redact_phone("94770000000"))
    with t.span("demo") as s:
        s.detail(api_key="SHOULD_STRIP", count=1)
    action = t.to_action()
    assert action["tool"] == "turn_trace"
    assert action["phone"] == "***0000"
    # secret key stripped from event detail
    demo = [e for e in action["events"] if e["name"] == "demo"][0]
    assert "api_key" not in (demo.get("detail") or {})
