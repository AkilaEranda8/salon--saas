"""Adversarial: Gemini-invented prices must never become official customer quotes."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.pricing_resolver import (
    OFFICIAL_LENGTH_TIERS,
    extract_lkr_amounts,
    is_price_enquiry,
    pick_quote_message,
    price_output_fallback,
    resolve_price,
    validate_reply_against_verified_amounts,
)

FIXTURE = Path(__file__).parent / "fixtures" / "t28_services.json"
CATALOGUE = json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_keratin_shoulder_official_25000():
    q = resolve_price("Keratin shoulder price?", CATALOGUE)
    assert q.ok and q.amount_lkr == 25000
    assert q.length == "shoulder"
    text = pick_quote_message(q, "english")
    assert 15000 not in extract_lkr_amounts(text)
    assert extract_lkr_amounts(text) == [25000]


@pytest.mark.parametrize("msg", [
    "Keratin shoulder mila",
    "Keratin kiyada? Shoulder length",
    "how much is keratin for shoulder",
    "කෙරටින් shoulder මිල",
])
def test_keratin_shoulder_multilingual(msg):
    q = resolve_price(msg, CATALOGUE)
    assert q.ok and q.amount_lkr == OFFICIAL_LENGTH_TIERS["keratin"]["shoulder"][0]


def test_gemini_invent_15000_rejected_by_validator():
    invent = "Keratin shoulder guide price is Rs. 15,000. Book now!"
    ok, found, blocked = validate_reply_against_verified_amounts(
        invent, allowed_amounts={25000}, block_any_amount=False
    )
    assert found == [15000]
    assert blocked == [15000]
    assert ok is False


def test_block_any_amount_on_price_ask_fallthrough():
    invent = "That service is Rs 18,000 or LKR 22,000"
    ok, found, blocked = validate_reply_against_verified_amounts(
        invent, block_any_amount=True
    )
    assert not ok and set(blocked) == {18000, 22000}


def test_verified_25000_allowed():
    reply = "Keratin (shoulder) guide price: Rs 25,000 · ~300 min."
    ok, found, blocked = validate_reply_against_verified_amounts(
        reply, allowed_amounts={25000}
    )
    assert ok and found == [25000] and blocked == []


def test_customer_asserts_wrong_price_is_price_enquiry():
    assert is_price_enquiry("Is keratin Rs 15000?")
    assert is_price_enquiry("keratin shoulder is it Rs 15,000?")
    assert is_price_enquiry("do you have discount on keratin?")


def test_wrong_assert_resolves_to_verified_or_length():
    q = resolve_price("Is keratin shoulder Rs 15000?", CATALOGUE)
    # Must not accept 15000 as official
    assert q.amount_lkr != 15000
    if q.ok:
        assert q.amount_lkr == 25000
    else:
        assert q.needs_length or q.needs_clarification or q.escalate


def test_galaxy_still_no_amount():
    q = resolve_price("Galaxy Plasma Treatment price kiyada?", CATALOGUE)
    assert q.amount_lkr is None and not q.ok


def test_butterfly_4500():
    q = resolve_price("Ladies Hair Cut-Butterfly price", CATALOGUE)
    assert q.ok and q.service_id == 278 and q.amount_lkr == 4500


def test_bra_strap_memory_30000():
    q = resolve_price("Bra Strap", CATALOGUE, memory={"pricing_service_key": "keratin"})
    assert q.ok and q.amount_lkr == 30000


def test_fallback_has_no_invented_amount():
    for mode in ("english", "singlish", "sinhala"):
        assert extract_lkr_amounts(price_output_fallback(mode)) == []


@pytest.mark.parametrize("invent", [
    "Special offer only Rs 9,999 today!",
    "Keratin hip is LKR 12,000",
    "We can do Rs 15000 for shoulder keratin",
    "Discounted rate රු 10000",
])
def test_adversarial_invents_blocked(invent):
    ok, _found, blocked = validate_reply_against_verified_amounts(
        invent, allowed_amounts={25000, 30000, 40000}, block_any_amount=False
    )
    assert not ok and blocked
