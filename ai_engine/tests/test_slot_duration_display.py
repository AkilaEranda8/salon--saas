"""Combined service duration + start→end slot display."""
from __future__ import annotations

from app.booking_flow import (
    BookingDraft,
    _draft_total_duration,
    _end_hhmm,
    _is_period_only_message,
    _is_slot_list_ask,
    _times_text,
    is_clear_step_answer,
    is_side_ask,
)


def test_end_hhmm():
    assert _end_hhmm("12:00", 90) == "13:30"
    assert _end_hhmm("09:15", 45) == "10:00"


def test_combined_duration_sums_extras():
    d = BookingDraft(
        service_id=1,
        service_name="Hair Cut",
        duration=45,
        extra_services=[
            {"id": 2, "name": "Facial", "duration_minutes": 60},
            {"id": 3, "name": "Clean Up", "duration_minutes": 30},
        ],
    )
    assert _draft_total_duration(d) == 135


def test_times_text_shows_start_to_end():
    d = BookingDraft(service_id=1, service_name="Hair Cut", duration=90)
    text = _times_text("en", "2026-11-15", ["12:00", "12:15", "17:00"], draft=d, period="afternoon")
    assert "12:00→13:30" in text
    assert "~90 min" in text
    assert "12.00 noon" not in text.lower() or "12:00" in text


def test_afternoon_period_only():
    assert _is_period_only_message("Afternoon") is True
    assert _is_period_only_message("heta afternoon") is True
    assert _is_period_only_message("12:00") is False


def test_slot_list_ask_stays_in_time_step():
    msg = "Athakota mage time slots monawada wada 3 ma"
    assert _is_slot_list_ask(msg) is True
    assert is_clear_step_answer(msg, expected="time") is True
    assert is_side_ask(msg, expected="time") is False
