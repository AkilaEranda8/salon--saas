"""Reschedule / cancel-confirm flows, intent narrowing, handoff regex, language, Gemini payload."""
import asyncio
import json
from datetime import date, timedelta

import pytest

from app import booking_flow as bf
from app.handoff import wants_human
from app.provider.gemini_provider import _build_contents, _max_output_tokens

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
APPT = {"id": 77, "date": "2099-01-05", "time": "10:00:00", "status": "confirmed",
        "staff_id": 3, "service_id": 9, "branch_id": 1}


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

    state = {"appts": [dict(APPT)], "resched_error": None}

    async def fake_run_tool(name, **kw):
        calls.append((name, kw))
        if name == "list_appointments":
            return state["appts"]
        if name == "list_services":
            return [{"id": 9, "name": "Haircut", "duration_minutes": 45, "price": 2000}]
        if name == "list_staff":
            return [{"id": 3, "name": "Nimali", "branch_id": 1}]
        if name == "check_availability":
            return {"slots": ["09:00", "10:00", "14:00"]}
        if name == "reschedule_appointment":
            if state["resched_error"]:
                raise state["resched_error"]
            return {"appointment": {"id": kw["appointment_id"]}}
        if name == "cancel_appointment":
            return {"appointment": {"id": kw["appointment_id"], "status": "cancelled"}}
        raise AssertionError(name)

    monkeypatch.setattr(bf, "run_tool", fake_run_tool)

    def turn(msg, **kw):
        return asyncio.run(
            bf.handle_booking_turn(
                tenant_id=1, conversation_id=5, phone="94771234567", message=msg, brand="Salon", **kw
            )
        )

    return turn, calls, state, store


def names(calls):
    return [c[0] for c in calls]


# ── reschedule ───────────────────────────────────────────────────────────────

def test_reschedule_end_to_end(env):
    turn, calls, _, _ = env
    r = turn("I want to reschedule my appointment")
    assert "currently 2099-01-05 10:00" in r["replyText"]  # single appt → skips pick
    r = turn(TOMORROW)
    assert "Available times" in r["replyText"]
    r = turn("2pm")
    assert "2099-01-05 10:00" in r["replyText"] and f"{TOMORROW} 14:00" in r["replyText"]
    assert "reschedule_appointment" not in names(calls)  # not before confirm
    r = turn("maybe")
    assert "reschedule_appointment" not in names(calls)
    r = turn("yes")
    assert r["booking"]["status"] == "rescheduled"
    name, kw = [c for c in calls if c[0] == "reschedule_appointment"][0]
    assert kw["appointment_id"] == 77 and kw["time"] == "14:00" and kw["date"] == TOMORROW
    assert kw["staff_id"] == 3 and kw["idempotency_key"].startswith("wa-resched:1:77:")
    # duration of the service was used for availability
    assert [c for c in calls if c[0] == "check_availability"][0][1]["duration"] == 45


def test_reschedule_pick_from_multiple_and_decline(env):
    turn, calls, state, _ = env
    state["appts"] = [dict(APPT), dict(APPT, id=78, date="2099-02-01")]
    r = turn("can you reschedule")
    assert "Which appointment" in r["replyText"]
    r = turn("2")
    assert "#78" in r["replyText"]
    turn(TOMORROW)
    turn("14:00")
    r = turn("no")
    assert "kept" in r["replyText"] and "reschedule_appointment" not in names(calls)


def test_reschedule_conflict_409_reasks_date(env):
    import httpx

    turn, calls, state, _ = env
    turn("reschedule my booking")
    turn(TOMORROW)
    turn("14:00")
    req = httpx.Request("PUT", "http://x")
    state["resched_error"] = httpx.HTTPStatusError("conflict", request=req, response=httpx.Response(409, request=req))
    r = turn("yes")
    assert "just taken" in r["replyText"] and r["booking"] is None
    state["resched_error"] = None
    assert "Available times" in turn(TOMORROW)["replyText"]


def test_reschedule_failure_is_never_retryable_booking(env):
    turn, calls, state, _ = env
    turn("reschedule my booking")
    turn(TOMORROW)
    turn("14:00")
    state["resched_error"] = RuntimeError("boom")
    r = turn("yes")
    # backend re-POSTs anything with status=failed+retryable — must not happen for reschedule
    assert r["booking"]["status"] == "reschedule_failed"
    assert not r["booking"].get("retryable")


# ── cancel confirm ───────────────────────────────────────────────────────────

def test_cancel_requires_confirm(env):
    turn, calls, _, _ = env
    r = turn("cancel my appointment")
    assert "yes" in r["replyText"].lower() and "cancel_appointment" not in names(calls)
    r = turn("cancel")  # ambiguous here: must not cancel
    assert "cancel_appointment" not in names(calls)
    r = turn("yes")
    assert r["booking"]["status"] == "cancelled" and "cancel_appointment" in names(calls)


def test_cancel_decline_keeps(env):
    turn, calls, _, _ = env
    turn("cancel my booking")
    r = turn("no")
    assert "cancel_appointment" not in names(calls) and "kept" in r["replyText"]


# ── intent ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("msg,expected", [
    ("i want", "chat"),
    ("available", "chat"),
    ("i want to know your hours", "chat"),
    ("what are your opening hours", "chat"),
    ("price of haircut", "chat"),
    ("how much is a facial", "chat"),
    ("where are you located", "chat"),
    ("i want a haircut", "book"),
    ("is a massage available tomorrow", "book"),
    ("book appointment", "book"),
    ("any slot tomorrow", "book"),
    ("book a haircut, how much is it", "book"),
    ("reschedule my appointment", "reschedule"),
    ("cancel my appointment", "cancel"),
    ("cancel my membership", "chat"),
])
def test_detect_intent(msg, expected):
    assert bf.detect_intent(msg, bf.Session()) == expected


def test_faq_with_knowledge_skips_flow(env):
    turn, calls, _, store = env
    assert turn("what time do you open", faq_with_knowledge=True) is None
    assert turn("price of haircut", faq_with_knowledge=True) is None
    # mid-flow FAQ doesn't wipe the draft
    turn("book appointment")
    assert turn("what are your opening hours", faq_with_knowledge=True) is None
    assert bf.get_session(bf.session_key(1, 5, "94771234567")).state == bf.AWAIT_SERVICE


# ── handoff ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("msg", [
    "manager special", "do you sell human hair", "I need human hair extensions",
    "agent orange", "what's the manager's special", "i want a human hair wig",
    "talk to us about human hair", "terrible weather today",
])
def test_no_false_handoff(msg):
    assert not wants_human(msg)


@pytest.mark.parametrize("msg", [
    "I want to talk to a human", "let me speak to a real person", "connect me to an agent",
    "agent please", "manager please", "I have a complaint", "I want a refund",
    "please get the manager", "සමාවෙන්න මට පැමිණිල්ලක් තියෙනවා",
])
def test_handoff_phrases(msg):
    assert wants_human(msg)


# ── language ─────────────────────────────────────────────────────────────────

def test_lang_detection():
    assert bf.detect_lang("මට හෙට වෙන්කර ගන්න ඕන") == "si"
    assert bf.detect_lang("நாளை முன்பதிவு செய்ய வேண்டும்") == "ta"
    assert bf.detect_lang("book tomorrow") == "en"
    assert bf.detect_lang("12:30") is None
    assert bf.update_lang("si", "yes") == "si"  # lone English token keeps Sinhala
    assert bf.update_lang("si", "please book me a haircut tomorrow") == "en"


def test_sinhala_prompts(env):
    turn, *_ = env
    r = turn("මට වෙන්කර ගන්න ඕන")
    assert "කුමක්ද" in r["replyText"]  # Sinhala service prompt, not English
    assert "Great!" not in r["replyText"]


def test_tamil_prompts_and_date(env):
    turn, *_ = env
    r = turn("முன்பதிவு")
    assert "எந்த சேவை" in r["replyText"]


def test_native_weekday_and_tomorrow():
    assert bf._parse_date("හෙට") == TOMORROW
    assert bf._parse_date("நாளை") == TOMORROW
    assert bf._parse_date("සෙනසුරාදා දින") is not None


# ── gemini ───────────────────────────────────────────────────────────────────

def test_gemini_keeps_system_role():
    system, contents = _build_contents([
        {"role": "system", "content": "RULES"},
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "user", "content": "book"},
    ])
    assert system == "RULES"
    assert [c["role"] for c in contents] == ["user", "model", "user"]
    assert "RULES" not in json.dumps(contents)


def test_gemini_merges_and_starts_with_user():
    _, contents = _build_contents([
        {"role": "assistant", "content": "a"},
        {"role": "user", "content": "u1"},
        {"role": "user", "content": "u2"},
    ])
    assert contents[0]["role"] == "user" and contents[1]["role"] == "model"
    assert "u1" in contents[2]["parts"][0]["text"] and "u2" in contents[2]["parts"][0]["text"]


def test_gemini_max_tokens():
    assert _max_output_tokens(512) == 1024
    assert _max_output_tokens(None) == 1024
    assert _max_output_tokens(5000) == 2048
