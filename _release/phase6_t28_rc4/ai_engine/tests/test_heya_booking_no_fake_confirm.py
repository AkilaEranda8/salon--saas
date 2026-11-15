"""Regression: Heya typo + Ok/Book must not Gemini fake-confirm loop."""
from __future__ import annotations

from app.booking_flow import (
    CONFIRM_TOKENS,
    _parse_date,
    _parse_time,
    is_clear_step_answer,
    is_exact_confirm,
    is_side_ask,
)


def test_heya_parses_as_tomorrow():
    d = _parse_date("Heya 10 am")
    assert d is not None
    assert is_clear_step_answer("Heya 10 am", expected="date") is True
    assert is_side_ask("Heya 10 am", expected="date") is False


def test_heta_still_parses():
    assert _parse_date("Heta 10 am") is not None


def test_830an_typo_parses_as_am():
    assert _parse_time("tomorrow 8.30an") == "08:30"
    assert _parse_time("8.30am") == "08:30"


def test_book_is_confirm_token():
    assert "book" in CONFIRM_TOKENS
    assert is_exact_confirm("Book") is True
    assert is_exact_confirm("Ok") is True
