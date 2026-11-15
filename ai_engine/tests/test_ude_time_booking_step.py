"""Regression: 'Ude 9 ta damu' must stay in booking SM (not Gemini fake fix)."""
from __future__ import annotations

from app.booking_flow import (
    _parse_time,
    _pick_period_slot,
    is_clear_step_answer,
    is_side_ask,
)


def test_parse_ude_9_ta_damu():
    assert _parse_time("Ude 9 ta damu") == "09:00"
    assert _parse_time("ude 9") == "09:00"
    assert _parse_time("9 ta ude") == "09:00"


def test_ude_9_is_clear_time_step():
    msg = "Ude 9 ta damu"
    assert is_clear_step_answer(msg, expected="time") is True
    assert is_side_ask(msg, expected="time") is False


def test_pick_period_prefers_clock_in_ude_phrase():
    slots = ["09:00", "09:15", "09:30", "10:00", "12:00", "17:00"]
    assert _pick_period_slot("Ude 9 ta damu", slots) == "09:00"
    assert _pick_period_slot("ude", slots) == "09:00"


def test_bare_ude_still_clear_period_answer():
    assert is_clear_step_answer("ude", expected="time") is True
    assert is_side_ask("ude", expected="time") is False
