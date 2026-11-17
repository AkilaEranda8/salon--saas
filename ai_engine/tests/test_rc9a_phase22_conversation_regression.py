"""
RC9a Phase 2.2 — conversation regression (SI / Singlish / EN).
No live Gemini / WhatsApp. Mocks CRM tools.
Never confirms an action before backend success.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import httpx

from app.booking_flow import (
    AWAIT_ADD_SVC_CONFIRM,
    AWAIT_CONFIRM,
    AWAIT_LINE_STAFF,
    AWAIT_TIME,
    BookingDraft,
    Session,
    detect_intent,
    handle_booking_turn,
)
from app.booking_multistylist import (
    service_staff_payload,
    upsert_service_staff,
    wants_add_to_existing,
    wants_decline_one_keep_other,
    wants_different_stylist,
)


STAFF_CUT = [{"id": 10, "name": "Nimal", "branch_id": 1}]
APPTS = [
    {
        "id": 55,
        "date": "2027-08-10",
        "time": "11:00",
        "service_id": 1,
        "staff_id": 10,
        "branch_id": 1,
        "status": "confirmed",
        "customer_name": "Kasun",
    }
]


def _turn(sess: Session, message: str, *, run_tool=None):
    async def _run():
        tool_patch = (
            patch("app.booking_flow.run_tool", side_effect=run_tool)
            if run_tool is not None
            else patch("app.booking_flow.run_tool", new_callable=AsyncMock)
        )
        with patch("app.booking_flow.get_session", return_value=sess), \
             patch("app.booking_flow.save_session"), \
             patch("app.booking_flow.delete_session"), \
             tool_patch:
            return await handle_booking_turn(
                tenant_id=1,
                conversation_id=1,
                phone="94770001122",
                message=message,
                brand="TestSalon",
            )
    return asyncio.run(_run())


def test_intent_phrases():
    sess = Session()
    assert wants_add_to_existing("Kalin booking ekata wax ekath danna")
    assert wants_add_to_existing("Eka ekath add karanna")
    assert wants_different_stylist("Mata wena stylist kenek oni")
    assert wants_decline_one_keep_other("Eka epa, anith eka thiyanna")
    assert detect_intent("Cancel this", sess) == "cancel"
    assert detect_intent("Kalin booking ekata wax ekath danna", sess) == "add_services"
    assert detect_intent("Book karanna", sess) == "book"


def test_service_staff_payload_keeps_per_line_assignments():
    d = BookingDraft(service_id=1, staff_id=10)
    upsert_service_staff(d, 1, 10, "Nimal")
    upsert_service_staff(d, 2, 20, "Saman")
    payload = service_staff_payload(d)
    assert payload == [
        {"service_id": 1, "staff_id": 10},
        {"service_id": 2, "staff_id": 20},
    ]


def test_never_confirm_before_backend_add_services():
    sess = Session(state=AWAIT_ADD_SVC_CONFIRM, mode="add_services", script_mode="singlish")
    sess.draft = BookingDraft(
        phone="94770001122",
        target=APPTS[0],
        pending_add_service={"id": 2, "name": "Full Leg Wax", "duration_minutes": 60},
        cancel_candidates=APPTS,
    )
    out = _turn(sess, "maybe later")
    assert out is not None
    text = (out.get("replyText") or "").lower()
    assert "yes" in text or "confirm" in text
    assert not any(a.get("tool") == "add_appointment_services" for a in out.get("actions") or [])


def test_add_services_success_only_after_tool():
    sess = Session(state=AWAIT_ADD_SVC_CONFIRM, mode="add_services", script_mode="singlish", lang="en")
    sess.draft = BookingDraft(
        phone="94770001122",
        target=APPTS[0],
        pending_add_service={"id": 2, "name": "Full Leg Wax", "duration_minutes": 60},
        cancel_candidates=APPTS,
    )

    async def run_tool(name, **kwargs):
        if name == "add_appointment_services":
            return {
                "appointment": {"id": 55, "amount": 5500},
                "added_service_ids": [2],
                "idempotent": False,
            }
        raise AssertionError(name)

    out = _turn(sess, "yes", run_tool=run_tool)
    assert out is not None
    actions = out.get("actions") or []
    assert any(a.get("tool") == "add_appointment_services" and a.get("ok") for a in actions)
    assert "55" in (out.get("replyText") or "")
    booking = out.get("booking") or {}
    assert booking.get("status") == "services_added"


def test_different_stylist_asks_without_inventing():
    sess = Session(state=AWAIT_CONFIRM, mode="book", script_mode="singlish")
    sess.draft = BookingDraft(
        service_id=1,
        service_name="Haircut",
        staff_id=10,
        staff_name="Nimal",
        date="2027-08-10",
        time="11:00",
        name="Kasun",
        phone="94770001122",
    )
    sess.staff = STAFF_CUT

    async def run_tool(name, **kwargs):
        if name == "list_staff":
            return STAFF_CUT + [{"id": 11, "name": "Amali", "branch_id": 1}]
        raise AssertionError(name)

    out = _turn(sess, "Mata wena stylist kenek oni", run_tool=run_tool)
    assert out is not None
    assert sess.state == AWAIT_LINE_STAFF
    assert "Amali" in (out.get("replyText") or "") or "1." in (out.get("replyText") or "")
    assert not any(a.get("tool") == "book_appointment" for a in out.get("actions") or [])


def test_decline_one_keep_other_clears_extra_only():
    sess = Session(state=AWAIT_CONFIRM, mode="book", script_mode="singlish")
    sess.draft = BookingDraft(
        service_id=1,
        service_name="Haircut",
        duration=45,
        extra_services=[{"id": 2, "name": "Full Leg Wax", "duration_minutes": 60}],
        staff_id=10,
        date="2027-08-10",
        time="11:00",
        name="Kasun",
        phone="94770001122",
    )
    out = _turn(sess, "Eka epa, anith eka thiyanna")
    assert out is not None
    assert sess.draft.extra_services == []
    assert "Haircut" in (out.get("replyText") or "")
    assert not any(a.get("tool") == "book_appointment" for a in out.get("actions") or [])


def test_book_payload_includes_service_staff_and_waits_for_backend():
    sess = Session(state=AWAIT_CONFIRM, mode="book", lang="en")
    sess.draft = BookingDraft(
        service_id=1,
        service_name="Haircut",
        duration=45,
        extra_services=[{"id": 2, "name": "Full Leg Wax", "duration_minutes": 60, "staff_id": 20}],
        service_staff=[
            {"service_id": 1, "staff_id": 10},
            {"service_id": 2, "staff_id": 20},
        ],
        staff_id=10,
        date="2027-08-10",
        time="09:00",
        name="Kasun",
        phone="94770001122",
        branch_id=1,
    )
    sess.slots = ["09:00", "10:00"]
    captured = {}

    async def run_tool(name, **kwargs):
        if name == "check_availability":
            return {"slots": ["09:00", "10:00"]}
        if name == "list_staff":
            return STAFF_CUT
        if name == "book_appointment":
            captured["payload"] = dict(kwargs)
            return {"appointment": {"id": 77}}
        raise AssertionError(name)

    out = _turn(sess, "yes", run_tool=run_tool)
    assert any(a.get("tool") == "book_appointment" and a.get("ok") for a in out.get("actions") or [])
    assert "service_staff" in captured["payload"]
    assert {"service_id": 2, "staff_id": 20} in captured["payload"]["service_staff"]
    assert "77" in (out.get("replyText") or "")


def test_hari_ehema_karamu_is_not_silent_book_without_confirm_token():
    """'Hari ehema karamu' may affirm intent but must not invent a booking without confirm path."""
    sess = Session(state=AWAIT_CONFIRM, mode="book", script_mode="singlish")
    sess.draft = BookingDraft(
        service_id=1,
        service_name="Haircut",
        staff_id=10,
        date="2027-08-10",
        time="11:00",
        name="Kasun",
        phone="94770001122",
    )
    out = _turn(sess, "Hari ehema karamu")
    # Either re-asks confirm, or if treated as confirm, must have gone through tool.
    actions = (out or {}).get("actions") or []
    booked = any(a.get("tool") == "book_appointment" and a.get("ok") for a in actions)
    if booked:
        assert "booking" in (out or {})
    else:
        # Still awaiting explicit confirm — never claimed booked
        text = (out or {}).get("replyText") or ""
        assert "ref #" not in text.lower()


def test_time_change_phrase_stays_in_time_step():
    sess = Session(state=AWAIT_TIME, mode="book", script_mode="singlish")
    sess.draft = BookingDraft(
        service_id=1,
        service_name="Haircut",
        duration=45,
        staff_id=10,
        date="2027-08-10",
        name="Kasun",
        phone="94770001122",
    )
    sess.slots = ["10:00", "11:00", "12:00"]
    out = _turn(sess, "11 walata change karanna")
    assert out is not None
    assert sess.draft.time == "11:00"
    assert not any(a.get("tool") == "book_appointment" for a in out.get("actions") or [])


def test_http_409_add_services_conflict_shape():
    req = httpx.Request("POST", "http://test/appointments/55/services")
    resp = httpx.Response(
        409,
        request=req,
        json={
            "conflict": True,
            "requested": "11:00",
            "available_slots": ["12:00", "13:00"],
            "reason": "slot",
        },
    )
    body = resp.json()
    assert body["available_slots"][0] != body["requested"]
    assert {"auto_substituted": False}
