"""Price-rejection + correction — do not hard-gate into 'which service price?'."""
from __future__ import annotations

from app.booking_flow import is_correction_message
from app.main import _understand_customer_ask
from app.pricing_resolver import is_price_enquiry, is_price_rejection


def test_screenshot_price_aka_newei_is_rejection():
    msg = "mama keewe time aka price aka newei"
    assert is_price_rejection(msg)
    assert not is_price_enquiry(msg)
    ask = _understand_customer_ask(msg)
    assert ask.get("price") is False


def test_english_didnt_ask_price():
    msg = "I didn't ask for the price"
    assert is_price_rejection(msg)
    assert not is_price_enquiry(msg)


def test_real_price_ask_still_true():
    assert is_price_enquiry("Butterfly Cut price kiyada?")
    assert not is_price_rejection("Butterfly Cut price kiyada?")


def test_check_history_is_correction():
    assert is_correction_message("Check history")
    assert is_correction_message("mama keewe time aka price aka newei")


def test_understand_does_not_force_price_intent_on_rejection():
    ask = _understand_customer_ask("mama keewe time aka price aka newei")
    assert ask["intent"] != "price"
    assert ask["intent"] != "price_category"
