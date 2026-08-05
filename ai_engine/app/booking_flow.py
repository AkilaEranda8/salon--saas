"""
WhatsApp AI CRM booking dialogue — separate from legacy ai_bot.
Deterministic state machine + salon tool calls.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Optional

from dataclasses import asdict

from app.session_store import (
    BookingSessionUnavailable,
    delete_session,
    load_session_raw,
    save_session_raw,
)
from app.tools import run_tool

IDLE = "idle"
AWAIT_SERVICE = "await_service"
AWAIT_STAFF = "await_staff"
AWAIT_DATE = "await_date"
AWAIT_TIME = "await_time"
AWAIT_NAME = "await_name"
AWAIT_CONFIRM = "await_confirm"
AWAIT_CANCEL_PICK = "await_cancel_pick"

CONFIRM_TOKENS = frozenset({"yes", "y", "ok", "okay", "confirm", "ඔව්", "ඔව්යි", "හරි"})
DECLINE_TOKENS = frozenset({"no", "nope", "cancel", "නැහැ", "නෑ"})


@dataclass
class BookingDraft:
    branch_id: Optional[int] = None
    service_id: Optional[int] = None
    service_name: Optional[str] = None
    duration: int = 30
    staff_id: Optional[int] = None
    staff_name: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    cancel_candidates: list = field(default_factory=list)


@dataclass
class Session:
    state: str = IDLE
    draft: BookingDraft = field(default_factory=BookingDraft)
    services: list = field(default_factory=list)
    staff: list = field(default_factory=list)
    slots: list = field(default_factory=list)
    mode: str = "book"  # book | cancel


def session_key(tenant_id: int, conversation_id: Optional[int], phone: Optional[str]) -> str:
    # Prefer conversation id for multi-replica Redis key (C12)
    return f"{tenant_id}:{conversation_id or 0}:{phone or 'unknown'}"


def _session_to_dict(sess: Session) -> dict[str, Any]:
    return {
        "state": sess.state,
        "mode": sess.mode,
        "draft": asdict(sess.draft),
        "services": sess.services,
        "staff": sess.staff,
        "slots": sess.slots,
    }


def _session_from_dict(data: Optional[dict[str, Any]]) -> Session:
    if not data:
        return Session()
    draft_raw = data.get("draft") or {}
    draft = BookingDraft(**{k: draft_raw.get(k) for k in BookingDraft.__dataclass_fields__})
    return Session(
        state=data.get("state") or IDLE,
        draft=draft,
        services=data.get("services") or [],
        staff=data.get("staff") or [],
        slots=data.get("slots") or [],
        mode=data.get("mode") or "book",
    )


def get_session(key: str) -> Session:
    return _session_from_dict(load_session_raw(key))


def save_session(key: str, sess: Session) -> None:
    save_session_raw(key, _session_to_dict(sess))


def reset_session(key: str) -> None:
    delete_session(key)
    save_session_raw(key, _session_to_dict(Session()))


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _message_tokens(text: str) -> list[str]:
    """Whitespace/punctuation tokens only — never substring-of-word matching."""
    t = _norm(text)
    if not t:
        return []
    return [p for p in re.split(r"[^\w\u0D80-\u0DFF]+", t, flags=re.UNICODE) if p]


def is_exact_confirm(message: str) -> bool:
    """Accept only exact intent tokens (C3). Rejects yesterday/july/know."""
    tokens = _message_tokens(message)
    if not tokens:
        return False
    # Whole message is a single confirm token, or every token is confirm-ish short reply
    if len(tokens) == 1 and tokens[0] in CONFIRM_TOKENS:
        return True
    if _norm(message) in CONFIRM_TOKENS:
        return True
    return False


def is_exact_decline(message: str) -> bool:
    tokens = _message_tokens(message)
    if not tokens:
        return False
    if len(tokens) == 1 and tokens[0] in DECLINE_TOKENS:
        return True
    if _norm(message) in DECLINE_TOKENS:
        return True
    return False


def detect_intent(text: str, sess: Session) -> str:
    t = _norm(text)
    if sess.state != IDLE:
        if any(x in t for x in ("cancel booking flow", "stop", "never mind", "nvm", "forget it", "exit")):
            return "abort"
        return "continue"
    if any(x in t for x in ("cancel my", "cancel appointment", "cancel booking", "remove booking")):
        return "cancel"
    if any(x in t for x in ("reschedule", "change appointment", "move my appointment")):
        return "reschedule"
    if any(
        x in t
        for x in (
            "book",
            "appointment",
            "reserve",
            "schedule",
            "i want",
            "haircut",
            "color",
            "facial",
            "massage",
            "slot",
            "available",
            "booking",
        )
    ):
        return "book"
    return "chat"


def _parse_date(text: str) -> Optional[str]:
    today = date.today()
    t = _norm(text)
    if "today" in t or "අද" in t:
        return today.isoformat()
    if "tomorrow" in t or "tomoro" in t or "හෙට" in t:
        return (today + timedelta(days=1)).isoformat()
    days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for i, name in enumerate(days):
        if name in t or name[:3] in t:
            delta = (i - today.weekday()) % 7
            if delta == 0:
                delta = 7
            return (today + timedelta(days=delta)).isoformat()
    m = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    if m:
        return m.group(1)
    m = re.search(r"(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?", text)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        y = int(m.group(3)) if m.group(3) else today.year
        if y < 100:
            y += 2000
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            try:
                return date(y, d, mo).isoformat()
            except ValueError:
                return None
    return None


def _parse_time(text: str) -> Optional[str]:
    t = _norm(text)
    m = re.search(r"\b(\d{1,2}):(\d{2})\b", t)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return f"{h:02d}:{mi:02d}"
    m = re.search(r"\b(\d{1,2})\s*(am|pm)\b", t)
    if m:
        h = int(m.group(1))
        ap = m.group(2)
        if ap == "pm" and h < 12:
            h += 12
        if ap == "am" and h == 12:
            h = 0
        return f"{h:02d}:00"
    m = re.search(r"\b(\d{1,2})\b", t)
    if m and ":" not in t:
        h = int(m.group(1))
        if 7 <= h <= 20:
            return f"{h:02d}:00"
    return None


def _pick_by_index_or_name(text: str, items: list[dict], name_key: str = "name") -> Optional[dict]:
    t = _norm(text)
    m = re.search(r"\b(\d{1,2})\b", t)
    if m:
        idx = int(m.group(1)) - 1
        if 0 <= idx < len(items):
            return items[idx]
    for it in items:
        name = _norm(str(it.get(name_key) or ""))
        if name and (name in t or t in name):
            return it
    # fuzzy token overlap
    tokens = set(t.split())
    best, best_score = None, 0
    for it in items:
        name = _norm(str(it.get(name_key) or ""))
        score = len(tokens & set(name.split()))
        if score > best_score:
            best, best_score = it, score
    return best if best_score >= 1 else None


def _format_list(items: list[dict], name_key: str = "name", extra_fn=None) -> str:
    lines = []
    for i, it in enumerate(items[:12], 1):
        extra = extra_fn(it) if extra_fn else ""
        lines.append(f"{i}. {it.get(name_key)}{extra}")
    return "\n".join(lines)


async def _load_services(tenant_id: int, sess: Session) -> list:
    if not sess.services:
        sess.services = await run_tool("list_services", tenant_id=tenant_id) or []
    return sess.services


async def handle_booking_turn(
    *,
    tenant_id: int,
    conversation_id: Optional[int],
    phone: Optional[str],
    message: str,
    brand: str,
    customer_name: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """
    Returns None if message should fall through to LLM chat.
    Else { replyText, actions, booking? }
    """
    key = session_key(tenant_id, conversation_id, phone)
    try:
        sess = get_session(key)
    except BookingSessionUnavailable as exc:
        return {
            "replyText": (
                "Booking is temporarily unavailable while we reconnect our session store. "
                "Please try again in a moment, or ask a staff member to help."
            ),
            "actions": [{"tool": "booking_session", "ok": False, "error": str(exc)}],
            "booking": None,
        }
    cleared = False

    def do_reset() -> None:
        nonlocal sess, cleared
        try:
            reset_session(key)
        except BookingSessionUnavailable:
            pass
        sess = Session()
        cleared = True

    try:
        return await _handle_booking_turn_body(
            key=key,
            sess=sess,
            do_reset=do_reset,
            tenant_id=tenant_id,
            phone=phone,
            message=message,
            brand=brand,
            customer_name=customer_name,
        )
    except BookingSessionUnavailable as exc:
        return {
            "replyText": (
                "Booking is temporarily unavailable while we reconnect our session store. "
                "Please try again in a moment."
            ),
            "actions": [{"tool": "booking_session", "ok": False, "error": str(exc)}],
            "booking": None,
        }
    finally:
        if not cleared:
            try:
                save_session(key, sess)
            except BookingSessionUnavailable:
                pass


async def _handle_booking_turn_body(
    *,
    key: str,
    sess: Session,
    do_reset,
    tenant_id: int,
    phone: Optional[str],
    message: str,
    brand: str,
    customer_name: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    intent = detect_intent(message, sess)
    actions: list[dict[str, Any]] = []

    if intent == "abort":
        do_reset()
        return {
            "replyText": "No problem — booking cancelled. How else can I help?",
            "actions": [{"tool": "booking_abort", "ok": True}],
            "booking": None,
        }

    if intent == "chat" and sess.state == IDLE:
        return None

    if intent == "reschedule" and sess.state == IDLE:
        return {
            "replyText": (
                "I can help reschedule. Please cancel the old appointment first "
                "(say 'cancel appointment'), then book a new slot — or ask a staff member."
            ),
            "actions": [{"tool": "reschedule_guide", "ok": True}],
            "booking": None,
        }

    # ── Cancel flow ──────────────────────────────────────────────────────────
    if intent == "cancel" or sess.mode == "cancel" or sess.state == AWAIT_CANCEL_PICK:
        return await _cancel_flow(tenant_id, sess, key, phone, message, actions, do_reset)

    # ── Start / continue book flow ───────────────────────────────────────────
    if intent == "book" and sess.state == IDLE:
        sess.mode = "book"
        sess.draft = BookingDraft(phone=phone, name=customer_name)
        services = await _load_services(tenant_id, sess)
        actions.append({"tool": "list_services", "ok": True, "count": len(services)})
        if not services:
            do_reset()
            return {
                "replyText": f"Sorry — no bookable services are listed for {brand} right now.",
                "actions": actions,
                "booking": None,
            }
        sess.state = AWAIT_SERVICE
        listing = _format_list(
            services,
            extra_fn=lambda s: f" — {s.get('duration_minutes', 30)} min · LKR {s.get('price', 0)}",
        )
        return {
            "replyText": f"Great! Which service would you like?\n{listing}\n\nReply with the number or name.",
            "actions": actions,
            "booking": None,
        }

    if sess.state == AWAIT_SERVICE:
        services = await _load_services(tenant_id, sess)
        picked = _pick_by_index_or_name(message, services)
        if not picked:
            listing = _format_list(services)
            return {
                "replyText": f"Please choose a service from the list:\n{listing}",
                "actions": actions,
                "booking": None,
            }
        sess.draft.service_id = int(picked["id"])
        sess.draft.service_name = picked.get("name")
        sess.draft.duration = int(picked.get("duration_minutes") or 30)
        staff = await run_tool("list_staff", tenant_id=tenant_id, service_id=sess.draft.service_id) or []
        sess.staff = staff
        actions.append({"tool": "list_staff", "ok": True, "count": len(staff)})
        if not staff:
            do_reset()
            return {
                "replyText": f"No staff available for {sess.draft.service_name}. Please try another service.",
                "actions": actions,
                "booking": None,
            }
        sess.state = AWAIT_STAFF
        listing = _format_list(staff)
        return {
            "replyText": f"Who would you like for *{sess.draft.service_name}*?\n{listing}\n\nReply with number or name.",
            "actions": actions,
            "booking": None,
        }

    if sess.state == AWAIT_STAFF:
        picked = _pick_by_index_or_name(message, sess.staff)
        if not picked:
            return {
                "replyText": f"Please pick a stylist:\n{_format_list(sess.staff)}",
                "actions": actions,
                "booking": None,
            }
        sess.draft.staff_id = int(picked["id"])
        sess.draft.staff_name = picked.get("name")
        if picked.get("branch_id"):
            sess.draft.branch_id = int(picked["branch_id"])
        sess.state = AWAIT_DATE
        return {
            "replyText": "What date? (today / tomorrow / Monday / YYYY-MM-DD)",
            "actions": actions,
            "booking": None,
        }

    if sess.state == AWAIT_DATE:
        d = _parse_date(message)
        if not d:
            return {
                "replyText": "Please send a date like *tomorrow*, *Saturday*, or *2026-08-05*.",
                "actions": actions,
                "booking": None,
            }
        sess.draft.date = d
        avail = await run_tool(
            "check_availability",
            tenant_id=tenant_id,
            staff_id=sess.draft.staff_id,
            date=d,
            duration=sess.draft.duration,
        )
        slots = avail.get("slots") if isinstance(avail, dict) else avail
        slots = slots or []
        sess.slots = slots
        actions.append({"tool": "check_availability", "ok": True, "count": len(slots)})
        if not slots:
            sess.state = AWAIT_DATE
            return {
                "replyText": f"No open slots on {d} for {sess.draft.staff_name}. Try another date?",
                "actions": actions,
                "booking": None,
            }
        sess.state = AWAIT_TIME
        shown = ", ".join(slots[:16])
        more = f" (+{len(slots) - 16} more)" if len(slots) > 16 else ""
        return {
            "replyText": f"Available times on {d}:\n{shown}{more}\n\nWhich time?",
            "actions": actions,
            "booking": None,
        }

    if sess.state == AWAIT_TIME:
        tm = _parse_time(message)
        if not tm:
            return {
                "replyText": f"Send a time like *10:00* or *2pm*. Options: {', '.join(sess.slots[:10])}",
                "actions": actions,
                "booking": None,
            }
        if sess.slots and tm not in sess.slots:
            return {
                "replyText": f"That slot isn’t free. Try: {', '.join(sess.slots[:12])}",
                "actions": actions,
                "booking": None,
            }
        sess.draft.time = tm
        if sess.draft.name or customer_name:
            sess.draft.name = sess.draft.name or customer_name
            sess.state = AWAIT_CONFIRM
            return {
                "replyText": _confirm_summary(sess) + "\n\nReply *yes* to confirm or *no* to cancel.",
                "actions": actions,
                "booking": None,
            }
        sess.state = AWAIT_NAME
        return {
            "replyText": "What name should we put on the booking?",
            "actions": actions,
            "booking": None,
        }

    if sess.state == AWAIT_NAME:
        name = message.strip()
        if len(name) < 2:
            return {"replyText": "Please send your name.", "actions": actions, "booking": None}
        sess.draft.name = name
        sess.state = AWAIT_CONFIRM
        return {
            "replyText": _confirm_summary(sess) + "\n\nReply *yes* to confirm or *no* to cancel.",
            "actions": actions,
            "booking": None,
        }

    if sess.state == AWAIT_CONFIRM:
        if is_exact_decline(message):
            do_reset()
            return {
                "replyText": "Okay, I cancelled that booking draft. Say *book* anytime to start again.",
                "actions": actions,
                "booking": None,
            }
        if not is_exact_confirm(message):
            return {
                "replyText": "Please reply *yes* to confirm or *no* to cancel.\n" + _confirm_summary(sess),
                "actions": actions,
                "booking": None,
            }
        if not phone:
            do_reset()
            return {
                "replyText": "I need your WhatsApp number to finish the booking. Please message us again from your phone.",
                "actions": actions,
                "booking": None,
            }

        idem = f"wa:{tenant_id}:{phone}:{sess.draft.service_id}:{sess.draft.staff_id}:{sess.draft.date}:{sess.draft.time}"
        payload = {
            "service_id": sess.draft.service_id,
            "staff_id": sess.draft.staff_id,
            "date": sess.draft.date,
            "time": sess.draft.time,
            "customer_name": sess.draft.name,
            "phone": phone,
            "branch_id": sess.draft.branch_id,
            "idempotency_key": idem,
            "notes": "Booked via WhatsApp AI CRM",
        }
        try:
            result = await run_tool("book_appointment", tenant_id=tenant_id, **payload)
            actions.append({"tool": "book_appointment", "ok": True})
        except Exception as exc:
            actions.append({"tool": "book_appointment", "ok": False, "error": str(exc)})
            return {
                "replyText": (
                    f"I couldn’t complete the booking just now ({exc}). "
                    "I’m retrying in the background — or pick another time / ask staff."
                ),
                "actions": actions,
                "booking": {
                    "status": "failed",
                    "retryable": True,
                    "payload": payload,
                    "idempotency_key": idem,
                    "error": str(exc),
                },
            }

        appt = result.get("appointment") if isinstance(result, dict) else None
        if not isinstance(appt, dict) or not appt.get("id"):
            actions.append({"tool": "book_appointment", "ok": False, "error": "no_appointment_in_result"})
            return {
                "replyText": (
                    "I couldn’t confirm the booking just now. "
                    "I’m retrying in the background — or ask staff to help."
                ),
                "actions": actions,
                "booking": {
                    "status": "failed",
                    "retryable": True,
                    "payload": payload,
                    "idempotency_key": idem,
                    "error": "no_appointment_in_result",
                    "result": result,
                },
            }
        do_reset()
        appt_id = appt.get("id")
        return {
            "replyText": (
                f"You’re booked! ✅\n"
                f"*{sess.draft.service_name}* with {sess.draft.staff_name}\n"
                f"{sess.draft.date} at {sess.draft.time}\n"
                f"See you at {brand}!"
            ),
            "actions": actions,
            "booking": {
                "status": "confirmed",
                "salon_appointment_id": appt_id,
                "payload": payload,
                "idempotency_key": idem,
                "result": result,
            },
        }

    return None


def _confirm_summary(sess: Session) -> str:
    d = sess.draft
    return (
        f"Please confirm:\n"
        f"• Service: {d.service_name}\n"
        f"• Staff: {d.staff_name}\n"
        f"• When: {d.date} {d.time}\n"
        f"• Name: {d.name}"
    )


async def _cancel_flow(
    tenant_id: int,
    sess: Session,
    key: str,
    phone: Optional[str],
    message: str,
    actions: list,
    do_reset,
) -> dict[str, Any]:
    sess.mode = "cancel"
    if not phone:
        do_reset()
        return {
            "replyText": "I need your phone number on this chat to find appointments.",
            "actions": actions,
            "booking": None,
        }

    if sess.state != AWAIT_CANCEL_PICK:
        try:
            rows = await run_tool("list_appointments", tenant_id=tenant_id, phone=phone) or []
            actions.append({"tool": "list_appointments", "ok": True, "count": len(rows)})
        except Exception as exc:
            actions.append({"tool": "list_appointments", "ok": False, "error": str(exc)})
            do_reset()
            return {
                "replyText": "I couldn’t load your appointments right now. Please try again shortly.",
                "actions": actions,
                "booking": None,
            }
        if not rows:
            do_reset()
            return {
                "replyText": "I don’t see any upcoming appointments on this number.",
                "actions": actions,
                "booking": None,
            }
        sess.draft.cancel_candidates = rows
        sess.state = AWAIT_CANCEL_PICK
        lines = []
        for i, a in enumerate(rows[:8], 1):
            lines.append(f"{i}. #{a.get('id')} — {a.get('date')} {str(a.get('time') or '')[:5]} ({a.get('status')})")
        return {
            "replyText": "Which appointment should I cancel?\n" + "\n".join(lines) + "\n\nReply with the number.",
            "actions": actions,
            "booking": None,
        }

    # pick
    m = re.search(r"\b(\d{1,2})\b", message)
    if not m:
        return {
            "replyText": "Reply with the appointment number from the list.",
            "actions": actions,
            "booking": None,
        }
    idx = int(m.group(1)) - 1
    cands = sess.draft.cancel_candidates
    if idx < 0 or idx >= len(cands):
        return {"replyText": "That number isn’t on the list. Try again.", "actions": actions, "booking": None}
    appt = cands[idx]
    appt_id = int(appt["id"])
    try:
        result = await run_tool("cancel_appointment", tenant_id=tenant_id, appointment_id=appt_id, reason="customer_whatsapp")
        actions.append({"tool": "cancel_appointment", "ok": True})
    except Exception as exc:
        actions.append({"tool": "cancel_appointment", "ok": False, "error": str(exc)})
        do_reset()
        return {
            "replyText": f"Couldn’t cancel that appointment ({exc}).",
            "actions": actions,
            "booking": None,
        }
    do_reset()
    return {
        "replyText": f"Cancelled appointment #{appt_id} on {appt.get('date')} {str(appt.get('time') or '')[:5]}.",
        "actions": actions,
        "booking": {"status": "cancelled", "salon_appointment_id": appt_id, "result": result},
    }
