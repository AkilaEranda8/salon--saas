"""
RC9a — Redis-loss multi-turn booking recovery (mandatory integration check).

Scenario:
  1) Customer selects a service
  2) Customer provides a date
  3) Redis booking session is lost
  4) Customer provides a time
  5) AI must recover conversational CRM context without inventing booking state
     or confirming a booking.

No live Redis / Gemini / WhatsApp.
"""
from __future__ import annotations

from app.booking_flow import IDLE, Session, session_key, _session_from_dict
from app.conversation_intelligence import (
    build_conversation_context,
    format_context_for_prompt,
    memory_patch_from_context,
)
from app.conversation_truth import ConversationTruth, format_truth_for_prompt
from app.response_quality import merge_memory_correction, validate_customer_reply


def _crm_after_service_select() -> dict:
    """CRM meta as if upsert ran after service selection (MySQL durable)."""
    return {
        "last_service": "keratin",
        "current_topic": "keratin",
        "last_service_id": 42,
        "last_quoted_price": "Rs 25000",
        "last_duration_minutes": 180,
        "booking_state": "await_date",
        "booking_status": None,
        "qa_history": [
            {"q": "Keratin book karanna oni", "a": "Hari — date eka kiyanna.", "topic": "keratin"},
        ],
        "conversation_truth": {
            "selected_service_id": {"value": 42, "confirmed": True, "confidence": 0.95},
            "selected_service_name": {"value": "keratin", "confirmed": True, "confidence": 0.95},
            "service_duration": {"value": 180, "confirmed": True, "confidence": 0.9},
            "booking_confirmation": {"value": None, "confirmed": False},
        },
        "pending_questions": ["booking_date"],
    }


def _crm_after_date(crm: dict) -> dict:
    out = dict(crm)
    out["preferred_date"] = "2026-11-20"
    out["booking_state"] = "await_time"
    out["pending_questions"] = ["booking_time"]
    truth = dict(out.get("conversation_truth") or {})
    truth["preferred_date"] = {"value": "2026-11-20", "confirmed": True, "confidence": 0.95}
    out["conversation_truth"] = truth
    out["qa_history"] = list(out.get("qa_history") or []) + [
        {"q": "2026-11-20", "a": "Hari — time eka kiyanna.", "topic": "keratin"},
    ]
    return out


def test_redis_loss_after_date_then_time_recovers_context_without_fake_book():
    # --- turns 1–2 durable CRM ---
    crm = _crm_after_date(_crm_after_service_select())
    assert crm["last_service"] == "keratin"
    assert crm["preferred_date"] == "2026-11-20"
    assert crm["booking_status"] is None

    # --- Redis lost: empty booking session (IDLE, no draft) ---
    redis_sess = _session_from_dict(None)
    assert redis_sess.state == IDLE
    assert getattr(redis_sess, "draft", None) is not None
    assert not redis_sess.draft.service_id
    assert not redis_sess.draft.date
    assert not redis_sess.draft.time
    assert not (redis_sess.truth or {})

    # Tenant-scoped keys still differ (isolation smoke)
    assert session_key(28, 501, "94770001111") != session_key(99, 501, "94770001111")

    # --- turn 3: customer sends time after Redis wipe ---
    msg = "10am"
    ctx = build_conversation_context(
        message=msg,
        tenant_id=28,
        phone="94770001111",
        conversation_id=501,
        memory=crm,
        booking_state=None,  # Redis gone — no live SM state
        booking_paused=False,
        recent_messages=[
            {"role": "user", "content": "Keratin book karanna oni"},
            {"role": "assistant", "content": "Hari — date eka kiyanna."},
            {"role": "user", "content": "2026-11-20"},
            {"role": "assistant", "content": "Hari — time eka kiyanna."},
        ],
    )
    prompt = format_context_for_prompt(ctx)
    truth = ConversationTruth.from_dict(crm["conversation_truth"])
    truth_block = format_truth_for_prompt(truth)

    # Conversational recovery from CRM
    assert ctx.current_topic == "keratin" or ctx.referent_topic == "keratin" or "keratin" in prompt.lower()
    assert ctx.preferred_date == "2026-11-20" or "2026-11-20" in prompt
    assert "keratin" in truth_block.lower()
    assert "2026-11-20" in truth_block

    # Must NOT invent confirmed booking from CRM alone
    assert crm.get("booking_status") not in ("confirmed", "booked")
    conf = (crm.get("conversation_truth") or {}).get("booking_confirmation") or {}
    assert not conf.get("confirmed")
    assert conf.get("value") in (None, "", False)

    # Fake confirm reply must fail quality gate (no backend book_appointment)
    fake = validate_customer_reply(
        msg,
        "Got it — locked in keratin tomorrow 10am, appointment is confirmed!",
        prior_topic="keratin",
        booking_confirmed=False,
        expected_service="keratin",
    )
    assert fake.ok is False
    assert fake.falsely_claims_booking is True or "false_booking_claim" in fake.missing

    # Safe recovery reply: acknowledge memory, ask to re-confirm step — no fake lock
    safe = validate_customer_reply(
        msg,
        "Hari — keratin + 2026-11-20 mathaka. 10am ta slot eka check karala confirm karanna oni nam *yes* kiyanna. "
        "Mama booking eka auto-confirm karanne naha.",
        prior_topic="keratin",
        booking_confirmed=False,
        expected_service="keratin",
    )
    assert safe.falsely_claims_booking is False

    # CI patch must not echo full qa_history (dedupe invariant)
    patch = memory_patch_from_context(ctx)
    assert not patch.get("qa_history")


def test_redis_loss_does_not_auto_confirm_from_crm_truth():
    crm = _crm_after_date(_crm_after_service_select())
    # Even if CRM still shows await_time, empty Redis session has no draft time
    sess = Session()
    assert sess.draft.time is None
    assert sess.draft.service_id is None
    # Prefer CRM date in context only — not as booking confirmation
    ctx = build_conversation_context(
        message="10am please",
        tenant_id=28,
        memory=crm,
        booking_state=None,
    )
    assert ctx.booking_status in (None, crm.get("booking_status"))
    assert ctx.booking_status != "confirmed"


def test_correction_after_redis_loss_clears_stale_ids():
    crm = _crm_after_date(_crm_after_service_select())
    # Redis gone; customer corrects service
    patch = merge_memory_correction(crm, field="last_service", new_value="haircut")
    assert patch["last_service_id"] is None
    assert patch["pricing_service_key"] is None
    assert patch["conversation_truth"]["selected_service_id"]["value"] is None
    assert patch["conversation_truth"]["selected_service_name"]["value"] == "haircut"
    # Date preference may remain; booking must still not be confirmed
    assert patch.get("booking_status") not in ("confirmed", "booked")
