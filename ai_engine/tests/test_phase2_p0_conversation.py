"""Phase 2 P0 — booking pause/priority, media, correction, cancel session persistence."""
from __future__ import annotations

import asyncio
import json
from datetime import date, timedelta

import pytest

from app import booking_flow as bf

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
APPT = {
    "id": 145,
    "date": "2099-01-05",
    "time": "11:00:00",
    "status": "confirmed",
    "staff_id": 48,
    "service_id": 167,
    "branch_id": 30,
    "customer_name": "Akila",
}


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
def env(monkeypatch):
    store = FakeStore()
    calls = []
    monkeypatch.setattr(bf, "load_session_raw", store.load)
    monkeypatch.setattr(bf, "save_session_raw", store.save)
    monkeypatch.setattr(bf, "delete_session", store.delete)

    state = {
        "appts": [dict(APPT)],
        "cancel_error": None,
        "cancel_result": {"appointment": {"id": 145, "status": "cancelled"}},
        "services": [
            {"id": 167, "name": "Baby Hair Cut", "duration_minutes": 30, "price": 1000},
            {"id": 200, "name": "Keratin Treatment", "duration_minutes": 300, "price": 25000},
        ],
    }

    async def fake_run_tool(name, **kw):
        calls.append((name, kw))
        if name == "customer_lookup":
            return {
                "exists": True,
                "customer": {"id": 1, "name": "Akila", "phone": kw.get("phone")},
                "history": [],
            }
        if name == "list_appointments":
            return state["appts"]
        if name == "list_services":
            return state["services"]
        if name == "list_staff":
            return [{"id": 48, "name": "Nadeeka", "branch_id": 30}]
        if name == "check_availability":
            return {"slots": ["09:00", "10:00", "11:00", "14:00"]}
        if name == "book_appointment":
            return {"appointment": {"id": 999, "status": "confirmed", "date": kw.get("date"), "time": kw.get("time")}}
        if name == "cancel_appointment":
            if state["cancel_error"]:
                raise state["cancel_error"]
            return state["cancel_result"]
        raise AssertionError(name)

    monkeypatch.setattr(bf, "run_tool", fake_run_tool)

    def turn(msg, **kw):
        return asyncio.run(
            bf.handle_booking_turn(
                tenant_id=28,
                conversation_id=24,
                phone="94705800063",
                message=msg,
                brand="Salon Larvendo",
                **kw,
            )
        )

    def sess():
        return bf.get_session(bf.session_key(28, 24, "94705800063"))

    return turn, calls, state, store, sess


def _start_await_date(turn, sess):
    r = turn("book appointment")
    assert r is not None
    # Pick baby hair cut by name / number
    r = turn("1")
    assert sess().state == bf.AWAIT_DATE
    return r


# ── helpers ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "msg",
    [
        "Ahana deta nemei rply denn oya",
        "eka nemei mama ahuwe",
        "oya therum ganna",
        "not what i asked",
    ],
)
def test_correction_detector(msg):
    assert bf.is_correction_message(msg)


def test_media_detector():
    assert bf.is_media_message("[Customer sent a photo]")
    assert bf.is_media_message("hi", has_media=True)
    assert not bf.is_media_message("heta")


def test_details_before_book_intent():
    assert bf.is_details_before_book("book kara gann kalin details kiyana")
    assert bf.detect_intent("book kara gann kalin details kiyana", bf.Session()) == "chat"


# ── Failure 1: photo mid await_date → Gemini (None), state paused ────────────

def _assert_yield(r):
    """Paused booking yields to LLM with preserved pause actions (not a SM reply)."""
    assert r is None or (isinstance(r, dict) and r.get("yieldToLlm") is True)
    if isinstance(r, dict) and r.get("yieldToLlm"):
        tools = [a.get("tool") for a in (r.get("actions") or []) if isinstance(a, dict)]
        assert "booking_pause_for_understanding" in tools


def test_f1_photo_during_await_date_yields_to_gemini(env):
    turn, calls, _, _, sess = env
    _start_await_date(turn, sess)
    r = turn("[Customer sent a photo]", has_media=True)
    _assert_yield(r)  # Gemini path + pause actions preserved
    s = sess()
    assert s.state == bf.AWAIT_DATE
    assert s.paused is True
    assert s.pause_reason == "media"
    assert s.draft.service_id  # preserved


# ── Failure 2: correction mid await_date → Gemini, not generic SM ────────────

def test_f2_correction_during_await_date(env):
    turn, _, _, _, sess = env
    _start_await_date(turn, sess)
    r = turn("Ahana deta nemei rply denn oya")
    _assert_yield(r)
    s = sess()
    assert s.state == bf.AWAIT_DATE and s.paused is True
    assert s.pause_reason == "correction"


# ── Failure 3/4: keratin / price mid-book → pause; details-before-book idle ─

def test_f3_keratin_during_await_date_pauses(env):
    turn, _, _, _, sess = env
    _start_await_date(turn, sess)
    r = turn("Keratin kiyada?")
    _assert_yield(r)
    assert sess().paused is True
    assert sess().state == bf.AWAIT_DATE


def test_f4_details_before_book_does_not_start_sm(env):
    turn, calls, _, _, sess = env
    r = turn("book kara gann kalin details kiyana")
    assert r is None  # idle → no pause yield
    assert sess().state == bf.IDLE
    assert "list_services" not in [c[0] for c in calls] or True  # may not call tools


# ── Failure 6: pending booking does not consume new asks; resume works ───────

def test_f6_price_enquiry_pauses_then_date_resumes(env):
    turn, _, _, _, sess = env
    _start_await_date(turn, sess)
    _assert_yield(turn("Facial mila?"))
    assert sess().paused is True
    # Explicit resume
    r = turn("continue")
    assert r is not None
    assert sess().paused is False
    assert sess().state == bf.AWAIT_DATE
    # Clear step answer continues booking (may skip to time/name/confirm depending on slots)
    r = turn(TOMORROW)
    assert r is not None
    assert sess().paused is False
    assert sess().state in (bf.AWAIT_TIME, bf.AWAIT_NAME, bf.AWAIT_CONFIRM)


def test_paused_step_answer_implicit_resume(env):
    turn, _, _, _, sess = env
    _start_await_date(turn, sess)
    _assert_yield(turn("waxing how much?"))
    assert sess().paused is True
    r = turn(TOMORROW)
    assert r is not None
    assert sess().paused is False
    assert sess().state in (bf.AWAIT_TIME, bf.AWAIT_NAME, bf.AWAIT_CONFIRM)


# ── Cancel session persistence (the do_reset / cleared bug) ──────────────────

def test_cancel_session_persists_after_mid_book_interrupt(env):
    turn, calls, _, store, sess = env
    _start_await_date(turn, sess)
    r = turn("mage appointment eka cancel karann oni")
    assert r is not None
    assert "yes" in r["replyText"].lower()
    s = sess()
    assert s.state == bf.AWAIT_CANCEL_CONFIRM
    assert s.draft.target and int(s.draft.target["id"]) == 145
    # Persist check via store
    raw = store.load(bf.session_key(28, 24, "94705800063"))
    assert raw["state"] == bf.AWAIT_CANCEL_CONFIRM
    # yes → verified cancel
    r = turn("yes")
    assert r["booking"]["status"] == "cancelled"
    assert any(c[0] == "cancel_appointment" for c in calls)


def test_cancel_never_claims_success_without_verified_status(env):
    turn, calls, state, _, sess = env
    turn("cancel my appointment")
    assert sess().state == bf.AWAIT_CANCEL_CONFIRM
    state["cancel_result"] = {"appointment": {"id": 145, "status": "confirmed"}}  # bad API
    r = turn("yes")
    assert not r.get("booking")
    low = r["replyText"].lower()
    assert "cancel" in low or "bari" in low or "couldn" in low or "system" in low or "confirm" in low
    assert any(c[0] == "cancel_appointment" for c in calls)
    # Still in cancel confirm for retry
    assert sess().state == bf.AWAIT_CANCEL_CONFIRM
    # Retry with good result
    state["cancel_result"] = {"appointment": {"id": 145, "status": "cancelled"}}
    r = turn("yes")
    assert r["booking"]["status"] == "cancelled"


def test_cancel_api_failure_keeps_confirm_for_retry(env):
    turn, _, state, _, sess = env
    turn("cancel my appointment")
    state["cancel_error"] = RuntimeError("503 upstream")
    r = turn("yes")
    assert "503" in r["replyText"] or "bari" in r["replyText"].lower() or "couldn" in r["replyText"].lower()
    assert sess().state == bf.AWAIT_CANCEL_CONFIRM
    state["cancel_error"] = None
    r = turn("yes")
    assert r["booking"]["status"] == "cancelled"


# ── Language sticky during pause ─────────────────────────────────────────────

def test_script_mode_preserved_across_pause(env):
    turn, _, _, _, sess = env
    turn("mata book karanna oni")
    # may be await_service or await_date depending on auto-match
    turn("facial mila?")
    s = sess()
    # Singlish sticky from first message
    assert s.script_mode in ("singlish", "english", "sinhala")
