"""
RC7 — screenshot conversation replay + conversation truth / booking consistency.

Conversation date anchor: 2026-11-15 Asia/Colombo.
Deterministic offline tests (no WA, no deploy).
"""
from __future__ import annotations

from datetime import date

from app.booking_flow import (
    BookingDraft,
    Session,
    _parse_date,
    _pick_by_index_or_name,
    _valid_future_date,
    detect_service_category,
)
from app.conversation_truth import (
    ConversationTruth,
    is_memory_recall_ask,
    parse_relative_date,
    set_field,
    short_numeric_intent,
    validate_booking_preflight,
)

NOW = date(2026, 11, 15)


def test_bug1_next_month_first_saturday():
    msg = "labana mase 1laweni sathiye booking ekak da gnn oni dressing walata"
    rel = parse_relative_date(msg, now=NOW)
    assert rel["ok"] is True
    assert rel["date"] == "2026-12-05"
    assert date.fromisoformat(rel["date"]).weekday() == 5  # Saturday
    assert _parse_date(msg, now=NOW) == "2026-12-05"
    assert detect_service_category(msg) == "dressing" or "dress" in (detect_service_category(msg) or "")


def test_bug1_never_november_16_from_relative():
    msg = "labana mase 1laweni sathiye"
    d = _parse_date(msg, now=NOW)
    assert d != "2026-11-16"
    assert d == "2026-12-05"


def test_bug5_short_msg_not_service_index():
    msg = "11 kiy nne me masene"
    assert short_numeric_intent(msg, expected_step="service") == "date_day"
    assert short_numeric_intent(msg, expected_step="date") == "date_day"
    items = [{"id": i, "name": f"Svc {i}"} for i in range(1, 20)]
    # Must NOT pick 11th catalogue row
    assert _pick_by_index_or_name(msg, items) is None
    assert _pick_by_index_or_name("3", items)["id"] == 3


def test_bug5_past_day_clarifies_not_invent():
    # 11 Nov is before 15 Nov → clarify rather than invent
    rel = parse_relative_date("11 kiy nne me masene", now=NOW)
    assert rel["ok"] is False
    assert rel.get("ambiguous") or rel.get("clarify")


def test_bug3_duration_preflight_120():
    pre = validate_booking_preflight(
        service_id=42,
        duration_minutes=120,
        preferred_date="2026-12-05",
        catalogue_duration=120,
    )
    assert pre["ok"] is True
    assert pre["duration_minutes"] == 120
    bad = validate_booking_preflight(
        service_id=42,
        duration_minutes=30,
        preferred_date="2026-12-05",
        catalogue_duration=120,
    )
    assert "duration_mismatch_vs_catalogue" in bad["errors"]


def test_bug4_memory_recall_phrases():
    assert is_memory_recall_ask("Mn oyt kakin kiuw dressing ek mokakd e")
    assert is_memory_recall_ask("oyata mathaka nadda")
    assert is_memory_recall_ask("mama kiwwa dressing eka")


def test_bug2_service_truth_not_overwrite_low_confidence():
    t = ConversationTruth()
    set_field(t, "selected_service_name", "Full Dressing", source="pick", confidence=0.95, confirmed=True)
    set_field(t, "selected_service_id", 99, source="pick", confidence=0.95, confirmed=True)
    # Ambiguous Gemini-ish overwrite blocked
    ok = set_field(
        t, "selected_service_name", "Ladies Hair Cut", source="hint", confidence=0.4
    )
    assert ok is False
    assert t.selected_service_name.value == "Full Dressing"
    # Explicit high-confidence correction allowed
    ok2 = set_field(
        t,
        "selected_service_name",
        "Ladies Hair Cut",
        source="change to hair cut",
        confidence=0.99,
        force=True,
    )
    assert ok2 is True


def test_bug6_dressing_category_from_message():
    assert detect_service_category("dressing walata booking") in ("dressing", "Dressing") or (
        detect_service_category("dressing walata booking") or ""
    ).lower().find("dress") >= 0


def test_valid_future_uses_colombo_anchor():
    assert _valid_future_date("2026-11-14", now=NOW) is None
    assert _valid_future_date("2026-12-05", now=NOW) == "2026-12-05"


def test_screenshot_replay_sequence_dates_and_numbers():
    """Ordered offline replay of critical turns from the WhatsApp screenshots."""
    turns = [
        ("labana mase 1laweni sathiye booking ekak da gnn oni dressing walata", "2026-12-05"),
        ("3", None),  # list index — not a date
        ("11 kiy nne me masene", None),  # past day clarify / not service
    ]
    d0 = _parse_date(turns[0][0], now=NOW)
    assert d0 == turns[0][1]
    assert short_numeric_intent(turns[1][0], expected_step="service") == "list_index"
    assert short_numeric_intent(turns[2][0], expected_step="date") == "date_day"
    assert _pick_by_index_or_name(turns[2][0], [{"id": i, "name": str(i)} for i in range(1, 15)]) is None


def test_session_truth_roundtrip_fields():
    from app.booking_flow import _session_from_dict, _session_to_dict, _sync_truth_from_draft

    sess = Session(
        state="await_date",
        draft=BookingDraft(
            service_id=7,
            service_name="Full Dressing",
            duration=120,
            date="2026-12-05",
        ),
        services=[{"id": 7, "name": "Full Dressing", "duration_minutes": 120}],
    )
    _sync_truth_from_draft(sess, source="test")
    raw = _session_to_dict(sess)
    assert raw["truth"]["selected_service_id"]["value"] == 7
    assert raw["truth"]["service_duration"]["value"] == 120
    restored = _session_from_dict(raw)
    assert restored.truth["selected_service_name"]["value"] == "Full Dressing"
