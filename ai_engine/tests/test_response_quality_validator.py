"""RC6 — multi-intent completeness + response quality validator."""
from __future__ import annotations

from app.response_quality import (
    decompose_customer_asks,
    merge_memory_correction,
    validate_customer_reply,
)


MULTI = (
    "Mata haircut ekak oni. Butterfly kiyada? Layer thiyenawada? "
    "Duration eka kochchara da? Kandy branch eka koheda?"
)


def test_decompose_multi_intent():
    units = decompose_customer_asks(MULTI)
    labels = {u.label for u in units}
    assert any("butterfly" in x for x in labels)
    assert any("layer" in x for x in labels)
    assert any("duration" in x for x in labels)
    assert any("location" in x or "branch" in x for x in labels)


def test_incomplete_reply_fails_validation():
    # Only answers location — drops price/duration/layer
    reply = "Larvendo Kandy branch eka William Gopallawa Mawatha eke thiyenawa."
    rep = validate_customer_reply(MULTI, reply)
    assert rep.ok is False
    assert len(rep.missing) >= 2
    assert rep.repair_hint


def test_complete_reply_passes():
    reply = (
        "Butterfly Cut Rs 4,500 (~105 min). Layer Cut catalogue eke separate list wela naha — "
        "stylist confirm karagannam. Ladies Hair Cut ~45 min. "
        "Branch: Larvendo Kandy, 254 William Gopallawa Mawatha."
    )
    rep = validate_customer_reply(MULTI, reply)
    assert rep.ok is True
    assert not rep.missing


def test_fake_booking_claim_flagged():
    rep = validate_customer_reply(
        "Book karanna",
        "Got it! Let's lock in your Hair Cut for tomorrow.",
        booking_confirmed=False,
    )
    assert rep.falsely_claims_booking is True
    assert rep.ok is False


def test_memory_correction_replaces():
    mem = {"last_service": "keratin", "current_topic": "keratin"}
    out = merge_memory_correction(mem, field="last_service", new_value="facial")
    assert out["last_service"] == "facial"
    assert out["current_topic"] == "facial"
    assert out["correction_log"][-1]["from"] == "keratin"


def test_rc7_price_identity_and_tool_failure():
    rep = validate_customer_reply(
        "Butterfly kiyada?",
        "Butterfly Rs 9,999.",
        price_hard_gated=True,
        verified_amounts=[4500],
    )
    assert rep.invented_price_risk is True or "price_identity" in rep.missing

    rep2 = validate_customer_reply(
        "Book karanna",
        "Your appointment is confirmed!",
        booking_confirmed=False,
        actions=[{"tool": "book_appointment", "ok": False}],
    )
    assert rep2.ok is False
