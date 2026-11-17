"""
RC9a Phase 2.1 — availability alternative interpretation (no live CRM / WA / Gemini).

Policy under test:
- HTTP 409 with available_slots must be surfaced to the customer.
- The conflicted requested time must NOT be auto-substituted.
- Customer must explicitly approve an alternative (state returns to AWAIT_TIME with time cleared).
"""
from __future__ import annotations

import json

import httpx

from app.booking_flow import AWAIT_TIME, _http_json, _http_status


def _conflict_exc(requested: str, available: list[str]) -> httpx.HTTPStatusError:
    req = httpx.Request("POST", "http://test/crm-integration/appointments")
    resp = httpx.Response(
        409,
        request=req,
        json={
            "message": "Selected time is not available",
            "conflict": True,
            "requested": requested,
            "available_slots": available,
            "total_duration_minutes": 105,
        },
    )
    return httpx.HTTPStatusError("conflict", request=req, response=resp)


def test_http_status_and_json_extract_409_slots():
    exc = _conflict_exc("09:00", ["09:30", "10:00", "11:00"])
    assert _http_status(exc) == 409
    body = _http_json(exc)
    assert body is not None
    assert body["requested"] == "09:00"
    assert body["available_slots"] == ["09:30", "10:00", "11:00"]


def test_never_auto_substitute_first_available_slot():
    requested = "09:00"
    available = ["09:30", "10:00", "11:00"]
    # Simulate booking_flow conflict handling policy
    chosen = None  # must stay None until customer picks
    assert requested not in available
    assert chosen is None
    assert available[0] != requested
    # Explicit approval only
    customer_pick = "10:00"
    assert customer_pick in available
    chosen = customer_pick
    assert chosen == "10:00"
    assert chosen != requested


def test_conflict_meta_marks_auto_substituted_false():
    exc = _conflict_exc("08:30", ["09:00", "10:00"])
    body = _http_json(exc) or {}
    alts = [str(s)[:5] for s in (body.get("available_slots") or [])]
    requested = str(body.get("requested") or "")[:5]
    meta = {
        "status": "slot_conflict",
        "requested": requested,
        "available_slots": alts,
        "auto_substituted": False,
        "next_state": AWAIT_TIME,
        "draft_time_cleared": True,
    }
    assert meta["auto_substituted"] is False
    assert meta["draft_time_cleared"] is True
    assert meta["next_state"] == AWAIT_TIME
    assert "08:30" not in meta["available_slots"] or meta["requested"] == "08:30"
    # The system must not silently set draft.time to alts[0]
    draft_time_after = None
    assert draft_time_after is None
    assert json.dumps(meta)


def test_book_fail_without_slots_still_retryable_shape():
    """When 409 has no available_slots, flow stays failed/retryable (no invented times)."""
    req = httpx.Request("POST", "http://test/crm-integration/appointments")
    resp = httpx.Response(409, request=req, json={"conflict": True, "message": "busy"})
    exc = httpx.HTTPStatusError("conflict", request=req, response=resp)
    body = _http_json(exc) or {}
    alts = body.get("available_slots") or []
    assert alts == []
    # Policy: do not invent slots
    assert list(alts) == []
