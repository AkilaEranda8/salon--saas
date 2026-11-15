"""
RC9 final audit — Python-side regression for corrections, QA echo, Redis/CRM recovery,
and tenant-scoped session keys. Local only.
"""
from __future__ import annotations

from app.booking_flow import session_key
from app.conversation_intelligence import (
    build_conversation_context,
    format_context_for_prompt,
    memory_patch_from_context,
)
from app.conversation_truth import ConversationTruth, format_truth_for_prompt
from app.response_quality import merge_memory_correction, validate_customer_reply


def test_audit_correction_clears_stale_service_id():
    mem = {
        "last_service": "keratin",
        "current_topic": "keratin",
        "last_service_id": 42,
        "pricing_service_key": "keratin",
        "conversation_truth": {
            "selected_service_id": {"value": 42, "confirmed": True},
            "selected_service_name": {"value": "keratin", "confirmed": True},
        },
    }
    patch = merge_memory_correction(mem, field="last_service", new_value="haircut")
    assert patch["last_service"] == "haircut"
    assert patch["current_topic"] == "haircut"
    assert patch["last_service_id"] is None
    assert patch["pricing_service_key"] is None
    assert patch["conversation_truth"]["selected_service_id"]["value"] is None
    assert patch["conversation_truth"]["selected_service_name"]["value"] == "haircut"


def test_audit_memory_patch_does_not_echo_full_qa_history():
    """Pre-fix: echoing qa_history in CI patch caused upsert duplicates."""
    ctx = build_conversation_context(
        message="Eka keeyada?",
        tenant_id=28,
        memory={
            "last_service": "keratin",
            "current_topic": "keratin",
            "qa_history": [
                {"q": "Keratin?", "a": "Ow", "topic": "keratin"},
                {"q": "Price?", "a": "25000", "topic": "keratin"},
            ],
        },
    )
    patch = memory_patch_from_context(ctx)
    assert "qa_history" not in patch or patch.get("qa_history") in (None, [])


def test_audit_crm_truth_recovers_into_prompt_after_redis_loss():
    """CRM conversation_truth still shapes the prompt when Redis session is gone."""
    truth = ConversationTruth.from_dict(
        {
            "selected_service_id": {"value": 42, "confirmed": True, "confidence": 0.95},
            "selected_service_name": {"value": "keratin", "confirmed": True, "confidence": 0.95},
            "preferred_date": {"value": "2026-11-20", "confirmed": True, "confidence": 0.95},
            "service_duration": {"value": 180, "confirmed": True, "confidence": 0.9},
        }
    )
    block = format_truth_for_prompt(truth)
    assert "keratin" in block.lower()
    assert "2026-11-20" in block

    ctx = build_conversation_context(
        message="Kalin kiwwa eka",
        tenant_id=28,
        memory={
            "last_service": "keratin",
            "current_topic": "keratin",
            "last_service_id": 42,
            "preferred_date": "2026-11-20",
            "last_quoted_price": "Rs 25000",
            "conversation_truth": truth.to_dict(),
            "qa_history": [{"q": "Eka keeyada?", "a": "Rs 25000", "topic": "keratin"}],
        },
        booking_state=None,  # Redis gone → no live booking state
    )
    prompt = format_context_for_prompt(ctx)
    assert "keratin" in prompt.lower()
    assert "25000" in prompt or "rs" in prompt.lower()
    assert "2026-11-20" in prompt


def test_audit_session_key_is_tenant_scoped():
    k28 = session_key(28, 100, "94771234567")
    k99 = session_key(99, 100, "94771234567")
    assert k28.startswith("28:")
    assert k99.startswith("99:")
    assert k28 != k99


def test_audit_quality_gates_not_weakened():
    """Informational ask still fails on generic booking pitch."""
    bad = validate_customer_reply(
        "Eka keeyada?",
        "Would you like to book? Date / time kiyanna, lock in a slot.",
        prior_topic="keratin",
        expected_service="keratin",
    )
    assert bad.ok is False
