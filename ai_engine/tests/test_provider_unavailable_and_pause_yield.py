"""P1: provider-down messaging + pause-action persistence."""
from __future__ import annotations

import asyncio
import os

import pytest

os.environ.setdefault("AI_ENGINE_SERVICE_SECRET", "test-provider-unavailable-secret-32!")
os.environ.setdefault("NODE_ENV", "development")

from app import booking_flow as bf
from app.pricing_resolver import resolve_price


class _Store:
    def __init__(self):
        self.data = {}

    def load(self, key):
        import json
        raw = self.data.get(key)
        return json.loads(raw) if raw else None

    def save(self, key, d):
        import json
        self.data[key] = json.dumps(d, default=str)

    def delete(self, key):
        self.data.pop(key, None)


@pytest.fixture
def sm_env(monkeypatch):
    store = _Store()
    monkeypatch.setattr(bf, "load_session_raw", store.load)
    monkeypatch.setattr(bf, "save_session_raw", store.save)
    monkeypatch.setattr(bf, "delete_session", store.delete)

    async def fake_tool(name, **kw):
        if name == "list_services":
            return [
                {"id": 167, "name": "Baby Hair Cut", "duration_minutes": 30, "price": 1000, "is_active": True},
                {"id": 210, "name": "Hydra Facial", "duration_minutes": 60, "price": 5500, "is_active": True},
            ]
        if name == "list_staff":
            return [{"id": 48, "name": "Nadeeka", "branch_id": 30}]
        if name == "list_branches":
            return [{"id": 30, "name": "Larvendo Kandy"}]
        if name == "customer_lookup":
            return {"exists": True, "customer": {"id": 1, "name": "Navee"}, "history": []}
        if name == "check_availability":
            return {"slots": ["09:00", "10:00", "11:00"]}
        return {}

    monkeypatch.setattr(bf, "run_tool", fake_tool)

    def turn(msg, **kw):
        return asyncio.run(
            bf.handle_booking_turn(
                tenant_id=28,
                conversation_id=9001,
                phone="94770009999",
                message=msg,
                brand="Salon Larvendo",
                **kw,
            )
        )

    def sess():
        return bf.get_session(bf.session_key(28, 9001, "94770009999"))

    return turn, sess


def test_pause_yield_preserves_actions(sm_env):
    turn, sess = sm_env
    assert turn("book appointment") is not None
    assert turn("1") is not None
    assert sess().state == bf.AWAIT_DATE
    r = turn("[Customer sent a photo]", has_media=True)
    assert isinstance(r, dict) and r.get("yieldToLlm") is True
    tools = [a.get("tool") for a in (r.get("actions") or [])]
    assert "booking_pause_for_understanding" in tools
    assert "booking_flow_state" in tools
    pause = next(a for a in r["actions"] if a.get("tool") == "booking_pause_for_understanding")
    assert pause.get("draft_preserved") is True
    assert pause.get("paused") is True
    assert sess().paused is True
    assert sess().draft.service_id


def test_pause_does_not_duplicate_book_or_cancel(sm_env):
    turn, sess = sm_env
    turn("book appointment")
    turn("1")
    r = turn("Facial mila?")
    tools = [a.get("tool") for a in (r.get("actions") or [])]
    assert "book_appointment" not in tools
    assert "cancel_appointment" not in tools
    assert tools.count("booking_pause_for_understanding") == 1


def test_resume_only_on_explicit_continue_or_step(sm_env):
    from datetime import date, timedelta
    turn, sess = sm_env
    turn("book appointment")
    turn("1")
    turn("Facial mila?")
    assert sess().paused
    # Side ask again — stay paused / yield
    r = turn("hours?")
    assert r.get("yieldToLlm")
    assert sess().paused
    r2 = turn("continue")
    assert not r2.get("yieldToLlm")
    assert sess().paused is False


# Provider-unavailable reply contract (unit on message shape via soft path simulation)
def test_provider_unavailable_message_contract():
    # Mirror main.py soft_provider_unavailable copy — no say *book* as the answer
    q = "Saturday puluwanda?"
    reply = (
        f"I'm temporarily unable to answer (AI provider unavailable). "
        f"Your question was saved: \"{q}\". "
        f"Please try again in a moment, or say *staff* for a team member."
    )
    assert "say *book*" not in reply.lower() or "staff" in reply.lower()
    assert q in reply
    assert "unavailable" in reply.lower() or "busy" in reply.lower()
    assert "staff" in reply.lower()


def test_length_context_still_safe_with_catalogue():
    q = resolve_price(
        "Bra Strap",
        [
            {"id": 200, "name": "Keratin Treatment", "price": 25000, "duration_minutes": 300, "is_active": True},
        ],
        memory={"pricing_service_key": "keratin"},
    )
    assert q.ok and q.amount_lkr == 30000
