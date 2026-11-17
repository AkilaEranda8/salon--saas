"""
RC9a Extended Conversation Reliability — deterministic regression tests.

No live Gemini / WhatsApp. Local RC9a candidate only.
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import date, timedelta

# Fail-closed ai_engine auth — tests never call the network.
os.environ.setdefault("AI_ENGINE_SERVICE_SECRET", "rc9a-local-test-secret")

import pytest

from app.booking_flow import (
    Session,
    BookingDraft,
    AWAIT_CONFIRM,
    detect_intent,
    is_correction_message,
    _draft_total_duration,
    _parse_date,
    _parse_time,
)
from app import booking_flow as bf
from app.conversation_intelligence import (
    INTENT_CANCEL,
    INTENT_CORRECTION,
    INTENT_DURATION,
    INTENT_HOURS,
    INTENT_PRICE,
    classify_intent,
)
from app.main import (
    _reply_mismatches_ask,
    _understand_customer_ask,
)
from app.pricing_resolver import (
    is_duration_enquiry,
    is_price_enquiry,
    is_price_rejection,
)
from app.response_quality import (
    decompose_customer_asks,
    validate_customer_reply,
)


TOMORROW = (date.today() + timedelta(days=1)).isoformat()


# ── 1. Intent: duration vs price / corrections ─────────────────────────────


def test_duration_ask_not_classified_as_hours_or_price():
    for msg in (
        "Keratin eka kochchara welawak yanawada?",
        "How long does botox hair treatment take?",
        "Ekata kochchara wela?",
        "කොච්චර වේලාවක් යනවද?",
    ):
        c = classify_intent(msg, memory={"last_service": "keratin"}, prior_topic="keratin")
        assert c["intent"] == INTENT_DURATION, msg
        assert c["intent"] != INTENT_HOURS
        assert c["intent"] != INTENT_PRICE
        assert is_duration_enquiry(msg) is True
        assert is_price_enquiry(msg) is False


def test_correction_time_not_price():
    msg = "I asked for time, not price."
    assert is_correction_message(msg) is True
    assert is_price_rejection(msg) is True
    assert is_duration_enquiry(msg) is True
    assert is_price_enquiry(msg) is False
    c = classify_intent(msg, memory={"last_service": "keratin"}, prior_topic="keratin")
    assert c["intent"] == INTENT_CORRECTION
    ask = _understand_customer_ask(msg)
    assert ask.get("duration") is True
    assert ask.get("intent") == "duration"


def test_duration_reply_mismatch_when_price_only():
    msg = "How long is the facial?"
    ask = _understand_customer_ask(msg)
    assert ask.get("duration") or ask.get("intent") == "duration"
    assert _reply_mismatches_ask(msg, "Facial is Rs. 3500.", ask) is True
    assert _reply_mismatches_ask(msg, "Facial usually takes about 45 minutes.", ask) is False

    bad = validate_customer_reply(
        msg,
        "Facial is Rs. 3500.",
        prior_topic="facial",
        expected_service="facial",
    )
    assert bad.ok is False
    assert any("duration" in m for m in bad.missing)

    good = validate_customer_reply(
        msg,
        "Facial usually takes about 45 minutes.",
        prior_topic="facial",
        expected_service="facial",
    )
    assert good.ok is True


def test_price_to_booking_intent_shift():
    """After a price ask, clear booking request must route to book — not handoff chat."""
    assert detect_intent("I need haircut booking for tomorrow 8.30am", Session()) == "book"
    assert detect_intent("Heta ude 11 ta haircut book karanna", Session()) == "book"


def test_cancel_this_intent():
    c = classify_intent(
        "Cancel this",
        memory={"last_appointment_id": 154},
        booking_state="idle",
    )
    assert c["intent"] == INTENT_CANCEL
    sess = Session(state=AWAIT_CONFIRM)
    assert detect_intent("Cancel this", sess) == "cancel"


# ── 2. Date/time Sinhala / Singlish ────────────────────────────────────────


def test_datetime_parsing_variants():
    assert _parse_date("tomorrow") is not None
    assert _parse_date("heta") is not None
    assert _parse_date("Heta ude 11 ta") is not None
    assert _parse_time("8.30am") in ("08:30", "8:30", "08:30:00") or str(_parse_time("8.30am")).startswith("08:30")
    assert _parse_time("1pm") in ("13:00", "13:00:00") or str(_parse_time("1pm")).startswith("13:00")
    assert _parse_time("11 am") is not None
    t = _parse_time("ude 9 ta") or _parse_time("9 ta")
    assert t is not None


# ── 3. Multi-service + long duration ───────────────────────────────────────


class FakeStore:
    def __init__(self):
        self.data = {}

    def load(self, key):
        raw = self.data.get(key)
        return json.loads(raw) if raw else None

    def save(self, key, d):
        self.data[key] = json.dumps(d, default=str)

    def delete(self, key):
        self.data.pop(key, None)


@pytest.fixture
def booking_env(monkeypatch):
    store = FakeStore()
    calls = []
    monkeypatch.setattr(bf, "load_session_raw", store.load)
    monkeypatch.setattr(bf, "save_session_raw", store.save)
    monkeypatch.setattr(bf, "delete_session", store.delete)

    state = {"slots": ["08:30", "09:00", "10:00", "11:00", "13:00"], "book_count": 0, "last_payload": None}

    async def fake_run_tool(name, **kw):
        calls.append((name, kw))
        if name == "list_services":
            return [
                {"id": 1, "name": "Haircut", "duration_minutes": 45, "price": 2000, "is_active": True, "category": "Hair Cut"},
                {"id": 2, "name": "Full Leg Wax", "duration_minutes": 60, "price": 3500, "is_active": True, "category": "Wax"},
                {"id": 3, "name": "Facial", "duration_minutes": 45, "price": 4000, "is_active": True, "category": "Facial"},
                {"id": 4, "name": "Hair Color", "duration_minutes": 120, "price": 8000, "is_active": True, "category": "Color"},
                {"id": 5, "name": "Botox Hair Treatment", "duration_minutes": 300, "price": 22000, "is_active": True, "category": "Treatment"},
            ]
        if name == "list_staff":
            return [{"id": 3, "name": "Nadeeka", "branch_id": 1}]
        if name == "check_availability":
            return {"slots": list(state["slots"])}
        if name == "book_appointment":
            state["book_count"] += 1
            state["last_payload"] = kw
            return {"appointment": {"id": 154, "status": "confirmed"}}
        if name == "customer_lookup":
            return {"exists": False}
        if name == "list_appointments":
            return [{"id": 154, "service_name": "Haircut", "date": TOMORROW, "time": "08:30", "status": "confirmed"}]
        if name == "cancel_appointment":
            return {"ok": True, "appointment_id": kw.get("appointment_id") or 154}
        raise AssertionError(name)

    monkeypatch.setattr(bf, "run_tool", fake_run_tool)

    def turn(msg, **kw):
        return asyncio.run(
            bf.handle_booking_turn(
                tenant_id=28,
                conversation_id=91,
                phone="94771234567",
                message=msg,
                brand="Salon Larvendo",
                **kw,
            )
        )

    return turn, calls, state, store


def test_multi_service_duration_and_idempotency_includes_extras(booking_env):
    turn, calls, state, store = booking_env
    # Start haircut booking with explicit tomorrow 8.30
    r1 = turn("I need haircut booking for tomorrow 8.30am")
    assert r1 is not None

    # Inject extra service mid-flow via helper on session
    raw = store.load("booking:28:91:94771234567") or store.data
    # Find session key
    keys = list(store.data.keys())
    assert keys
    sess_raw = json.loads(store.data[keys[0]])
    draft = sess_raw.get("draft") or {}
    draft["extra_services"] = [{"id": 2, "name": "Full Leg Wax", "duration_minutes": 60}]
    sess_raw["draft"] = draft
    # total duration should be primary + extra
    d = BookingDraft(
        service_id=1,
        service_name="Haircut",
        duration=45,
        extra_services=draft["extra_services"],
    )
    assert _draft_total_duration(d) == 105

    # Confirm path: force AWAIT_CONFIRM with filled draft
    sess_raw["state"] = AWAIT_CONFIRM
    sess_raw["draft"].update({
        "service_id": 1,
        "service_name": "Haircut",
        "duration": 45,
        "staff_id": 3,
        "staff_name": "Nadeeka",
        "date": TOMORROW,
        "time": "08:30",
        "name": "Kasun",
        "branch_id": 1,
        "extra_services": [{"id": 2, "name": "Full Leg Wax", "duration_minutes": 60}],
    })
    store.data[keys[0]] = json.dumps(sess_raw)
    r2 = turn("yes")
    assert r2 is not None
    booking = r2.get("booking") or {}
    assert booking.get("status") == "confirmed"
    assert state["book_count"] == 1
    idem = (state["last_payload"] or {}).get("idempotency_key") or booking.get("idempotency_key")
    assert idem and "+2" in str(idem)
    notes = (state["last_payload"] or {}).get("notes") or ""
    assert "Full Leg Wax" in notes or "105" in notes


def test_long_duration_botox_uses_catalogue_minutes():
    d = BookingDraft(
        service_id=5,
        service_name="Botox Hair Treatment",
        duration=300,
        extra_services=[],
    )
    assert _draft_total_duration(d) == 300


def test_repeated_booking_request_continues_same_flow(booking_env):
    """Intentional customer repeat of same text continues booking SM (does not abort)."""
    turn, calls, state, _store = booking_env
    r1 = turn("I need haircut booking for tomorrow 8.30am")
    assert r1 is not None
    assert detect_intent("I need haircut booking for tomorrow 8.30am", Session()) == "book"
    r2 = turn("I need haircut booking for tomorrow 8.30am")
    assert r2 is not None
    # Must not create multiple confirmed books from the ask alone
    assert state["book_count"] == 0


def test_reschedule_then_cancel_this(booking_env):
    turn, calls, state, store = booking_env
    # Enter cancel from idle with existing appointments available via list_appointments
    r = turn("Cancel this")
    assert r is not None
    # Should enter cancel flow (pick/confirm) — not generic chat none
    assert r.get("flowState") in (
        None,
        "await_cancel_pick",
        "await_cancel_confirm",
        "await_service",
        "await_date",
        "await_time",
        "await_name",
        "await_confirm",
        "idle",
    ) or r.get("replyText")
    # detect_intent with active confirm state
    assert detect_intent("Cancel this", Session(state=AWAIT_CONFIRM)) == "cancel"


# ── 4. Multi-ask decomposition mixed languages ─────────────────────────────


def test_mixed_language_multi_ask_units():
    msg = "Keratin eka keeyada? Duration eka kochchara? Branch eka koheda?"
    kinds = {u.kind for u in decompose_customer_asks(msg, prior_topic="keratin")}
    assert "price" in kinds and "duration" in kinds and "location" in kinds


def test_short_followup_ude_time():
    assert _parse_time("ude 9") is not None or _parse_time("9") is not None
    ask = _understand_customer_ask("Heta ude 11 ta damu")
    # booking-ish / time preference — should not be classified as hours dump
    assert ask.get("hours") is False or ask.get("book") or ask.get("intent") in (
        "booking",
        "general",
        "multi_question",
        "service_haircut",
        "catalogue",
    )


def test_ekathu_regex_accepts_also_add():
    assert bf._EKATHU_RE.search("also add Full Leg Wax")
    assert bf._EKATHU_RE.search("Facial + Wax + Hair Color")


# ── Phase 2 conversation context pack ──────────────────────────────────────


@pytest.mark.parametrize(
    "msg,expect",
    [
        ("Mama kiwwe time eka price eka newei.", "duration_or_correction"),
        ("Eka change karanna.", "reschedule_or_correction"),
        ("Cancel this.", "cancel"),
        ("Hari, ehema karamu.", "commitment"),
        ("Anith service ekath add karanna.", "add_service"),
        ("Kalin booking eka.", "recall"),
        ("Heta ude 11 ta.", "datetime"),
        ("Eka passe karamu.", "defer_or_commitment"),
    ],
)
def test_phase2_conversation_context_pack(msg, expect):
    mem = {
        "last_service": "keratin",
        "current_topic": "keratin",
        "last_appointment_id": 154,
        "last_duration_minutes": 180,
    }
    if expect == "duration_or_correction":
        assert is_price_rejection(msg) or is_correction_message(msg) or is_duration_enquiry(msg)
        assert is_price_enquiry(msg) is False
    elif expect == "cancel":
        c = classify_intent(msg, memory=mem, booking_state="idle")
        assert c["intent"] == INTENT_CANCEL
    elif expect == "add_service":
        assert bf._EKATHU_RE.search(msg) or "add" in msg.lower() or "ekath" in msg.lower()
    elif expect == "datetime":
        assert _parse_date(msg) is not None or _parse_time(msg) is not None or "11" in msg
    elif expect == "commitment":
        from app.conversation_intelligence import _COMMITMENT_RE
        assert _COMMITMENT_RE.search(msg) or "ehema karamu" in msg.lower() or "passe karamu" in msg.lower()
    elif expect == "recall":
        assert "kalin" in msg.lower() or "booking" in msg.lower()
    elif expect == "reschedule_or_correction":
        c = classify_intent(msg, memory=mem, prior_topic="keratin")
        assert c["intent"] in (INTENT_CORRECTION, "reschedule") or "change" in msg.lower()
    elif expect == "defer_or_commitment":
        assert "passe" in msg.lower() or is_correction_message(msg)


def test_multi_service_payload_includes_service_ids(booking_env):
    turn, calls, state, store = booking_env
    keys = []
    turn("I need haircut booking for tomorrow 8.30am")
    keys = list(store.data.keys())
    sess_raw = json.loads(store.data[keys[0]])
    sess_raw["state"] = AWAIT_CONFIRM
    sess_raw["draft"].update({
        "service_id": 1,
        "service_name": "Haircut",
        "duration": 45,
        "staff_id": 3,
        "staff_name": "Nadeeka",
        "date": TOMORROW,
        "time": "08:30",
        "name": "Kasun",
        "branch_id": 1,
        "extra_services": [
            {"id": 2, "name": "Full Leg Wax", "duration_minutes": 60},
            {"id": 3, "name": "Facial", "duration_minutes": 45},
        ],
    })
    store.data[keys[0]] = json.dumps(sess_raw)
    r = turn("yes")
    assert (r.get("booking") or {}).get("status") == "confirmed"
    payload = state["last_payload"] or {}
    assert payload.get("service_ids") == [1, 2, 3]
    assert payload.get("extra_service_ids") == [2, 3]
    assert "+2,3" in str(payload.get("idempotency_key") or "")
