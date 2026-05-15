"""
Conversation state machine — manages multi-step booking flow per session.
Each session_id gets its own ConversationState object.
"""
import re
from datetime import datetime, date, timedelta
from dataclasses import dataclass, field
from typing import Optional
import salon_api
import llm_client


# ── State names ──────────────────────────────────────────────────────────────
IDLE           = "idle"
AWAIT_SERVICE  = "await_service"
AWAIT_STAFF    = "await_staff"
AWAIT_DATE     = "await_date"
AWAIT_TIME     = "await_time"
AWAIT_NAME     = "await_name"
AWAIT_PHONE    = "await_phone"
AWAIT_CONFIRM  = "await_confirm"


@dataclass
class BookingDraft:
    branch_id:   Optional[int]   = None
    service_id:  Optional[int]   = None
    service_name: Optional[str]  = None
    staff_id:    Optional[int]   = None
    staff_name:  Optional[str]   = None
    date:        Optional[str]   = None   # YYYY-MM-DD
    time:        Optional[str]   = None   # HH:MM
    name:        Optional[str]   = None
    phone:       Optional[str]   = None


MAX_HISTORY = 12   # keep last N message pairs in memory


@dataclass
class ConversationState:
    state: str = IDLE
    draft: BookingDraft = field(default_factory=BookingDraft)
    # Conversation history: list of {"role": "user"|"bot", "text": str}
    history: list = field(default_factory=list)
    # Last detected intent (for context-aware re-scoring)
    last_intent: str = ""
    # Cached data fetched from API
    services:  list = field(default_factory=list)
    staff:     list = field(default_factory=list)
    branches:  list = field(default_factory=list)


# In-memory session store  {session_id: ConversationState}
_sessions: dict[str, ConversationState] = {}


def get_session(session_id: str) -> ConversationState:
    if session_id not in _sessions:
        _sessions[session_id] = ConversationState()
    return _sessions[session_id]


def reset_session(session_id: str):
    _sessions[session_id] = ConversationState()


def add_to_history(session_id: str, role: str, text: str):
    sess = get_session(session_id)
    sess.history.append({"role": role, "text": text})
    # Trim to max history
    if len(sess.history) > MAX_HISTORY * 2:
        sess.history = sess.history[-(MAX_HISTORY * 2):]


def get_history_summary(sess: ConversationState) -> str:
    """Return last few exchanges as readable context."""
    if not sess.history:
        return ""
    lines = []
    for h in sess.history[-6:]:
        prefix = "You" if h["role"] == "user" else "Bot"
        lines.append(f"{prefix}: {h['text'][:80]}")
    return "\n".join(lines)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_date(text: str) -> Optional[str]:
    """Try to extract a date from user input. Returns YYYY-MM-DD or None."""
    today = date.today()
    t = text.lower().strip()

    if "today" in t or "today" in t:
        return today.isoformat()
    if "tomorrow" in t or "tomoro" in t or "tomrw" in t:
        return (today + timedelta(days=1)).isoformat()

    # Day names
    days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]
    for i, d_name in enumerate(days):
        if d_name in t or d_name[:3] in t:
            target_wd = i
            current_wd = today.weekday()
            delta = (target_wd - current_wd) % 7
            if delta == 0:
                delta = 7
            return (today + timedelta(days=delta)).isoformat()

    # YYYY-MM-DD
    m = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    if m:
        return m.group(1)

    # DD/MM or DD-MM
    m = re.search(r"(\d{1,2})[/-](\d{1,2})", text)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        year = today.year
        try:
            parsed = date(year, month, day)
            if parsed < today:
                parsed = date(year + 1, month, day)
            return parsed.isoformat()
        except ValueError:
            pass

    return None


def _parse_time(text: str) -> Optional[str]:
    """Extract HH:MM from user input."""
    t = text.lower()

    # "3pm", "3 pm", "15:00", "3:30pm"
    m = re.search(r"(\d{1,2}):(\d{2})\s*(am|pm)?", t)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        suffix = m.group(3)
        if suffix == "pm" and h != 12:
            h += 12
        elif suffix == "am" and h == 12:
            h = 0
        if 0 <= h < 24 and 0 <= mi < 60:
            return f"{h:02d}:{mi:02d}"

    m = re.search(r"(\d{1,2})\s*(am|pm)", t)
    if m:
        h = int(m.group(1))
        suffix = m.group(2)
        if suffix == "pm" and h != 12:
            h += 12
        elif suffix == "am" and h == 12:
            h = 0
        if 0 <= h < 24:
            return f"{h:02d}:00"

    return None


def _parse_phone(text: str) -> Optional[str]:
    digits = re.sub(r"\D", "", text)
    if len(digits) >= 9:
        return digits
    return None


def _format_services(services: list) -> str:
    if not services:
        return "Sorry, no services available right now."
    lines = ["Here are our services:\n"]
    current_cat = None
    for i, s in enumerate(services, 1):
        cat = s.get("category", "Other")
        if cat != current_cat:
            lines.append(f"\n**{cat}**")
            current_cat = cat
        lines.append(f"  {i}. {s['name']} — Rs. {s['price']} ({s['duration_minutes']} mins)")
    return "\n".join(lines)


def _format_staff(staff: list) -> str:
    if not staff:
        return "No staff listed at the moment."
    lines = ["Our team:\n"]
    for i, s in enumerate(staff, 1):
        role = s.get("role_title", "Stylist")
        lines.append(f"  {i}. {s['name']} ({role})")
    return "\n".join(lines)


def _format_branches(branches: list) -> str:
    if not branches:
        return "No branches found."
    lines = ["Our branches:\n"]
    for b in branches:
        lines.append(f"  • **{b['name']}** — {b.get('address','')}")
        if b.get("phone"):
            lines.append(f"    📞 {b['phone']}")
    return "\n".join(lines)


# ── Main handler ─────────────────────────────────────────────────────────────

async def handle_management(intent: str, token: str) -> str | None:
    """Handle internal management queries. Returns None if intent not management-related."""
    from datetime import date

    today_str = date.today().strftime("%d %b %Y")  # e.g. "25 Mar 2026"

    # ── Today's appointments ─────────────────────────────────────────────
    if intent == "today_appointments":
        appts = await salon_api.get_today_appointments(token)
        if not appts:
            return (
                f"No appointments scheduled for today ({today_str}).\n\n"
                "📌 Tip: Check **pending bookings** — some may need confirmation."
            )
        by_status: dict = {}
        for a in appts:
            s = a.get("status", "unknown")
            by_status[s] = by_status.get(s, 0) + 1
        lines = [f"**Today's Appointments ({today_str})** — {len(appts)} total\n"]
        for status, count in sorted(by_status.items()):
            icon = {"confirmed": "✅", "pending": "⏳", "completed": "💰", "cancelled": "❌"}.get(status, "•")
            lines.append(f"{icon} {status.capitalize()}: **{count}**")
        # List next 5 upcoming
        upcoming = [a for a in appts if a.get("status") in ("confirmed", "pending")][:5]
        if upcoming:
            lines.append("\n**Upcoming:**")
            for a in upcoming:
                t     = (a.get("time") or "")[:5]
                cust  = a.get("customer_name", "Customer")
                svc   = a.get("service", {}).get("name", "") if isinstance(a.get("service"), dict) else ""
                staff = a.get("staff", {}).get("name", "") if isinstance(a.get("staff"), dict) else ""
                lines.append(f"• {t} — **{cust}** ({svc}) with {staff}")
        pending_count = by_status.get("pending", 0)
        if pending_count > 0:
            lines.append(f"\n⚠️ {pending_count} appointment(s) still **pending** — confirm them!")
        lines.append("\nSay **today revenue** to see earnings.")
        return "\n".join(lines)

    # ── Pending appointments ─────────────────────────────────────────────
    if intent == "pending_appointments":
        appts = await salon_api.get_pending_appointments(token)
        if not appts:
            return "No pending appointments right now. All clear!"
        lines = [f"**Pending Appointments** — {len(appts)} waiting for confirmation\n"]
        for a in appts[:8]:
            d = a.get("date", "")
            t = (a.get("time") or "")[:5]
            cust = a.get("customer_name", "Customer")
            svc  = a.get("service", {}).get("name", "") if isinstance(a.get("service"), dict) else ""
            lines.append(f"• {d} {t} — **{cust}** ({svc})")
        if len(appts) > 8:
            lines.append(f"  ...and {len(appts)-8} more")
        lines.append("\nGo to **Appointments** page to confirm them.")
        return "\n".join(lines)

    # ── Today's revenue ──────────────────────────────────────────────────
    if intent == "today_revenue":
        payments = await salon_api.get_today_payments(token)
        if not payments:
            return (
                f"No payments recorded for today ({today_str}) yet.\n\n"
                "📌 Check if appointments have been marked as **completed**."
            )
        total = sum(float(p.get("total_amount", 0)) for p in payments)
        cash  = sum(float(p.get("total_amount", 0)) for p in payments if p.get("payment_method") == "cash")
        card  = sum(float(p.get("total_amount", 0)) for p in payments if p.get("payment_method") == "card")
        other = total - cash - card
        comm  = sum(float(p.get("commission_amount", 0)) for p in payments)
        avg   = total / len(payments) if payments else 0
        lines = [
            f"**Today's Revenue ({today_str})**\n",
            f"💰 **Total:      Rs. {total:,.0f}**",
            f"🧾 Transactions: {len(payments)}  (avg Rs. {avg:,.0f} each)",
            f"💵 Cash:         Rs. {cash:,.0f}",
            f"💳 Card:         Rs. {card:,.0f}",
        ]
        if other > 0:
            lines.append(f"🔄 Other:         Rs. {other:,.0f}")
        lines.append(f"🤝 Commission:   Rs. {comm:,.0f}")
        lines.append("\nSay **staff performance** to see who earned the most!")
        return "\n".join(lines)

    # ── Recent payments ──────────────────────────────────────────────────
    if intent == "recent_payments":
        payments = await salon_api.get_today_payments(token)
        if not payments:
            return "No payments found for today."
        lines = [f"**Recent Payments Today** ({len(payments)} transactions)\n"]
        for p in payments[:6]:
            amt  = float(p.get("total_amount", 0))
            cust = p.get("customer_name", "Customer")
            svc  = p.get("service", {}).get("name", "") if isinstance(p.get("service"), dict) else ""
            t    = (p.get("time") or p.get("created_at") or "")[:5]
            lines.append(f"• {t} — **{cust}** | {svc} | Rs. {amt:,.0f}")
        return "\n".join(lines)

    # ── Staff performance ─────────────────────────────────────────────────
    if intent == "staff_stats":
        from datetime import date
        month = date.today().strftime("%B %Y")
        staff = await salon_api.get_staff_report(token)
        if not staff:
            return "No staff data available for this month."
        lines = [f"**Staff Performance — {month}**\n"]
        for i, s in enumerate(staff[:8], 1):
            name = s.get("name") or s.get("dataValues", {}).get("name", "Staff")
            rev  = float(s.get("totalRevenue") or s.get("dataValues", {}).get("totalRevenue") or 0)
            appts = int(s.get("apptCount") or s.get("dataValues", {}).get("apptCount") or 0)
            comm = float(s.get("totalCommission") or s.get("dataValues", {}).get("totalCommission") or 0)
            medal = ["🥇","🥈","🥉"][i-1] if i <= 3 else f"{i}."
            lines.append(f"{medal} **{name}** — Rs. {rev:,.0f} | {appts} appts | comm Rs. {comm:,.0f}")
        return "\n".join(lines)

    # ── Low inventory ─────────────────────────────────────────────────────
    if intent == "low_inventory":
        items = await salon_api.get_low_stock(token)
        if not items:
            return "✅ All inventory levels are fine! No low stock alerts right now."
        lines = [f"**⚠️ Low Stock Alert** — {len(items)} item(s) need restocking\n"]
        for item in items[:10]:
            name  = item.get("name", "Item")
            qty   = item.get("quantity", 0)
            unit  = item.get("unit", "")
            min_q = item.get("min_quantity", item.get("minQuantity", ""))
            line  = f"• **{name}** — {qty} {unit} left"
            if min_q:
                line += f" (min: {min_q})"
            lines.append(line)
        if len(items) > 10:
            lines.append(f"  ...and {len(items)-10} more items")
        lines.append("\n📦 Go to **Inventory** page to restock these items.")
        return "\n".join(lines)

    # ── Walk-in queue ─────────────────────────────────────────────────────
    if intent == "walkin_status":
        queue = await salon_api.get_walkin_queue(token)
        waiting = [w for w in queue if w.get("status") in ("waiting", "pending")]
        serving = [w for w in queue if w.get("status") == "serving"]
        lines = [f"**Walk-in Queue Status**\n",
                 f"⏳ Waiting: **{len(waiting)}**",
                 f"💇 Being served: **{len(serving)}**"]
        if waiting:
            lines.append("\n**In queue:**")
            for w in waiting[:5]:
                name = w.get("customer_name", "Customer")
                svc  = w.get("service", {}).get("name", "") if isinstance(w.get("service"), dict) else ""
                lines.append(f"• {name}" + (f" — {svc}" if svc else ""))
        return "\n".join(lines)

    # ── Customer stats ────────────────────────────────────────────────────
    if intent == "customer_stats":
        data  = await salon_api.get_customer_count(token)
        total = data.get("total", data.get("count", 0))
        dash  = await salon_api.get_dashboard(token)
        new_this_month = dash.get("newCustomersMonth", dash.get("new_customers_month", 0))
        lines = [
            "**Customer Statistics**\n",
            f"👥 Total Customers: **{total:,}**",
        ]
        if new_this_month:
            lines.append(f"🆕 New this month: **{new_this_month}**")
        lines.append("\nGo to **Customers** page for full details.")
        return "\n".join(lines)

    return None   # Not a management intent


async def handle_message(
    session_id: str,
    text: str,
    intent: str,
    token: str | None = None,
    needs_clarify: bool = False,
) -> str:
    sess = get_session(session_id)

    # Record user message in history
    add_to_history(session_id, "user", text)
    prev_intent = sess.last_intent
    sess.last_intent = intent

    # ── Low confidence: ask clarifying question ───────────────────────────────
    if needs_clarify and sess.state == IDLE:
        reply = await _clarify_response(text, prev_intent, sess.history)
        add_to_history(session_id, "bot", reply)
        return reply

    # ── Management queries (authenticated) ────────────────────────────────────
    if token and sess.state == IDLE:
        mgmt_reply = await handle_management(intent, token)
        if mgmt_reply is not None:
            add_to_history(session_id, "bot", mgmt_reply)
            return mgmt_reply

    # ── Always-available commands ─────────────────────────────────────────────
    if intent == "goodbye":
        reset_session(session_id)
        reply = "Thank you for visiting Zane Salon! See you soon 😊"
        return reply

    if intent == "help":
        reply = _help_message(token)
        add_to_history(session_id, "bot", reply)
        return reply

    # ── Booking state machine ─────────────────────────────────────────────────
    if sess.state != IDLE:
        reply = await _handle_booking_flow(session_id, sess, text, intent)
        add_to_history(session_id, "bot", reply)
        return reply

    # ── Intents from idle state ───────────────────────────────────────────────
    if intent == "greet":
        # Personalise based on history (returning user?)
        if len(sess.history) > 2:
            reply = "Welcome back! 👋 What else can I help you with?"
        else:
            reply = (
                "Hello! Welcome to **Zane Salon** 💇\n\n"
                "I can help you:\n"
                "• 📅 Book an appointment\n"
                "• 💅 Check our services & prices\n"
                "• 📍 Find our branches\n"
                "• 👤 View our stylists\n\n"
                "What would you like to do?"
            )
        add_to_history(session_id, "bot", reply)
        return reply

    if intent == "book_appointment":
        services = await salon_api.get_services()
        sess.services = services
        sess.state = AWAIT_SERVICE
        reply = (
            _format_services(services) +
            "\n\nWhich service would you like? "
            "(Type the number or service name)"
        )
        add_to_history(session_id, "bot", reply)
        return reply

    if intent == "check_services":
        services = await salon_api.get_services()
        reply = _format_services(services) + "\n\nWould you like to book one? Just say **book**!"
        add_to_history(session_id, "bot", reply)
        return reply

    if intent == "check_prices":
        services = await salon_api.get_services()
        lines = ["**Price List:**\n"]
        for s in services:
            lines.append(f"• {s['name']}: Rs. {s['price']}")
        reply = "\n".join(lines) + "\n\nWant to book? Say **book**!"
        add_to_history(session_id, "bot", reply)
        return reply

    if intent == "check_branches":
        branches = await salon_api.get_branches()
        reply = _format_branches(branches)
        add_to_history(session_id, "bot", reply)
        return reply

    if intent == "check_staff":
        staff = await salon_api.get_staff()
        reply = _format_staff(staff) + "\n\nWant to book with a specific stylist? Say **book**!"
        add_to_history(session_id, "bot", reply)
        return reply

    if intent == "check_availability":
        staff = await salon_api.get_staff()
        sess.staff = staff
        sess.state = AWAIT_STAFF
        sess.draft = BookingDraft()
        reply = (
            _format_staff(staff) +
            "\n\nWhich staff member would you like to check? "
            "(Type number or name)"
        )
        add_to_history(session_id, "bot", reply)
        return reply

    if intent == "cancel_appointment":
        reply = (
            "To cancel an appointment, please contact us directly:\n"
            "📞 Call or visit your nearest branch.\n\n"
            "Would you like to book a new appointment instead?"
        )
        add_to_history(session_id, "bot", reply)
        return reply

    # ── LLM-powered fallback ─────────────────────────────────────────────────
    reply = await _smart_fallback(text, prev_intent, bool(token), sess.history)
    add_to_history(session_id, "bot", reply)
    return reply


async def _clarify_response(text: str, prev_intent: str, history: list) -> str:
    """Low-confidence reply — use LLM if available, else static."""
    if llm_client.is_available():
        context = f"Previous topic: {prev_intent}" if prev_intent else ""
        llm_resp = await llm_client.llm_reply(text, context=context, history=history)
        if llm_resp:
            return llm_resp
    base = f"I'm not quite sure what you mean by \"*{text[:40]}*\". "
    if prev_intent in ("book_appointment", "check_services", "check_prices"):
        return base + "Were you asking about **booking** or **services**? Try saying:\n• \"book appointment\"\n• \"show services\"\n• \"price list\""
    if prev_intent in ("today_appointments", "pending_appointments", "today_revenue"):
        return base + "Were you asking about **today's data**? Try:\n• \"today appointments\"\n• \"today revenue\"\n• \"pending bookings\""
    return base + "Try saying:\n• **book** — for an appointment\n• **services** — to see what we offer\n• **help** — for all options"


async def _smart_fallback(text: str, prev_intent: str, is_staff: bool, history: list) -> str:
    """LLM-powered fallback — uses NVIDIA NIM if available, else static rules."""
    if llm_client.is_available():
        context_parts = []
        if is_staff:
            context_parts.append("User is a staff/manager with access to management data.")
        if prev_intent:
            context_parts.append(f"Previous conversation topic: {prev_intent}")
        context = "\n".join(context_parts)
        llm_resp = await llm_client.llm_reply(text, context=context, history=history)
        if llm_resp:
            return llm_resp
    # Static fallback if LLM unavailable
    t = text.lower()
    if any(w in t for w in ["appoint", "book", "slot", "time"]):
        return "It looks like you want to **book an appointment**. Just say **book** and I'll guide you through it! 📅"
    if any(w in t for w in ["price", "cost", "much", "charge", "gana", "kiyada"]):
        return "Looking for **prices**? Say **price list** and I'll show you all our service charges! 💰"
    if any(w in t for w in ["where", "location", "branch", "address"]):
        return "Looking for our **locations**? Say **branches** and I'll show you all our salon branches! 📍"
    if is_staff and any(w in t for w in ["revenue", "today", "appointment", "staff", "payment", "stock"]):
        return "I'm not sure which **management data** you need. Try:\n• \"today appointments\"\n• \"today revenue\"\n• \"pending bookings\"\n• \"staff performance\"\n• \"low stock\""
    return (
        "I didn't quite catch that. I can help with:\n"
        "• 📅 **book** — Book an appointment\n"
        "• 💅 **services** — See all services & prices\n"
        "• 📍 **branches** — Find our locations\n"
        "• ❓ **help** — See everything I can do\n\n"
        "What would you like?"
    )


def _help_message(token: str | None) -> str:
    lines = [
        "Here's what I can do for you:\n",
        "**Appointments**",
        "• Say **book** to start a new booking",
        "• Say **cancel** to cancel an appointment\n",
        "**Information**",
        "• **services** — see all services",
        "• **price list** — see all prices",
        "• **branches** — find our locations",
        "• **staff** — meet our stylists",
        "• **availability** — check free slots\n",
    ]
    if token:
        lines += [
            "**Management (Staff)**",
            "• **today appointments** — today's schedule",
            "• **pending bookings** — unconfirmed appointments",
            "• **today revenue** — today's earnings",
            "• **staff performance** — team stats",
            "• **low stock** — inventory alerts",
            "• **walk-in queue** — current waiting list",
            "• **customer stats** — total customers",
            "• **recent payments** — latest transactions\n",
        ]
    lines.append("How can I help?")
    return "\n".join(lines)


async def _handle_booking_flow(
    session_id: str, sess: ConversationState, text: str, intent: str
) -> str:

    # Allow user to restart at any point
    if intent == "book_appointment" and sess.state != AWAIT_CONFIRM:
        sess.state = AWAIT_SERVICE
        sess.draft = BookingDraft()
        services = await salon_api.get_services()
        sess.services = services
        return (
            _format_services(services) +
            "\n\nWhich service would you like? (Type number or name)"
        )

    # ── Step 1: Choose service ────────────────────────────────────────────────
    if sess.state == AWAIT_SERVICE:
        services = sess.services or await salon_api.get_services()
        sess.services = services

        chosen = _match_item(text, services, "name")
        if not chosen:
            return (
                "I couldn't find that service. Please type the number or name:\n"
                + _format_services(services)
            )
        sess.draft.service_id   = chosen["id"]
        sess.draft.service_name = chosen["name"]

        # Only 1 branch? auto-select it
        branches = await salon_api.get_branches()
        sess.branches = branches
        if len(branches) == 1:
            sess.draft.branch_id = branches[0]["id"]

        staff = await salon_api.get_staff(sess.draft.branch_id)
        sess.staff = staff
        sess.state = AWAIT_STAFF
        return (
            f"Great choice! **{chosen['name']}** — Rs. {chosen['price']}\n\n"
            + _format_staff(staff) +
            "\n\nWhich stylist would you prefer? "
            "(Type number/name, or say **any** for first available)"
        )

    # ── Step 2: Choose staff ──────────────────────────────────────────────────
    if sess.state == AWAIT_STAFF:
        staff = sess.staff or await salon_api.get_staff()

        if re.search(r"\bany\b|\bno preference\b|\bdont care\b|anyone", text, re.I):
            chosen = staff[0] if staff else None
        else:
            chosen = _match_item(text, staff, "name")

        if not chosen:
            return (
                "Couldn't find that stylist. Please pick from:\n"
                + _format_staff(staff)
                + "\n\n(Or say **any** for first available)"
            )

        sess.draft.staff_id   = chosen["id"]
        sess.draft.staff_name = chosen["name"]
        sess.state = AWAIT_DATE
        return (
            f"Booked with **{chosen['name']}**!\n\n"
            "What date would you like? "
            "(e.g. **tomorrow**, **Monday**, **25/04**, or **2026-04-25**)"
        )

    # ── Step 3: Choose date ───────────────────────────────────────────────────
    if sess.state == AWAIT_DATE:
        parsed = _parse_date(text)
        if not parsed:
            return (
                "Couldn't understand that date. Please try:\n"
                "• **tomorrow**\n• **Monday**\n• **25/04**\n• **2026-04-25**"
            )

        chosen_date = datetime.strptime(parsed, "%Y-%m-%d").date()
        if chosen_date < date.today():
            return "That date is in the past! Please choose today or a future date."

        sess.draft.date = parsed
        booked_times    = await salon_api.get_availability(sess.draft.staff_id, parsed)
        free_slots      = _get_free_slots(booked_times)

        if not free_slots:
            sess.state = AWAIT_DATE
            return (
                f"Sorry, **{chosen['name'] if (chosen := None) else 'that stylist'}** "
                f"has no free slots on **{parsed}**.\n"
                "Please choose another date."
            )

        sess.state = AWAIT_TIME
        slots_str = "  ".join(free_slots)
        return (
            f"Available slots on **{parsed}**:\n\n`{slots_str}`\n\n"
            "What time works for you? (e.g. **10:00**, **2pm**, **14:30**)"
        )

    # ── Step 4: Choose time ───────────────────────────────────────────────────
    if sess.state == AWAIT_TIME:
        parsed_time = _parse_time(text)
        if not parsed_time:
            return "Couldn't read that time. Try: **10:00**, **2pm**, or **14:30**"

        # Check still available
        booked = await salon_api.get_availability(sess.draft.staff_id, sess.draft.date)
        if parsed_time in booked:
            free_slots = _get_free_slots(booked)
            return (
                f"Sorry, **{parsed_time}** is already taken!\n"
                f"Free slots: `{'  '.join(free_slots)}`\n"
                "Please pick another time."
            )

        sess.draft.time = parsed_time
        sess.state      = AWAIT_NAME
        return "What is your **full name** for the booking?"

    # ── Step 5: Name ─────────────────────────────────────────────────────────
    if sess.state == AWAIT_NAME:
        name = text.strip()
        if len(name) < 2:
            return "Please enter your full name."
        sess.draft.name = name
        sess.state      = AWAIT_PHONE
        return f"Thanks, **{name}**! What is your **phone number**?"

    # ── Step 6: Phone ─────────────────────────────────────────────────────────
    if sess.state == AWAIT_PHONE:
        phone = _parse_phone(text)
        if not phone:
            return "Please enter a valid phone number (at least 9 digits)."
        sess.draft.phone = phone
        sess.state       = AWAIT_CONFIRM

        d = sess.draft
        return (
            "**Please confirm your booking:**\n\n"
            f"• Service:  **{d.service_name}**\n"
            f"• Stylist:  **{d.staff_name}**\n"
            f"• Date:     **{d.date}**\n"
            f"• Time:     **{d.time}**\n"
            f"• Name:     **{d.name}**\n"
            f"• Phone:    **{d.phone}**\n\n"
            "Type **yes** to confirm, or **no** to cancel."
        )

    # ── Step 7: Confirm ───────────────────────────────────────────────────────
    if sess.state == AWAIT_CONFIRM:
        if re.search(r"\byes\b|\bconfirm\b|\bok\b|\byep\b|\bsure\b|\bawa\b|\boy\b", text, re.I):
            d = sess.draft
            result = await salon_api.create_booking({
                "branch_id":     d.branch_id,
                "service_id":    d.service_id,
                "staff_id":      d.staff_id,
                "customer_name": d.name,
                "phone":         d.phone,
                "date":          d.date,
                "time":          d.time,
            })
            reset_session(session_id)
            if result["success"]:
                return (
                    "Booking confirmed! ✅\n\n"
                    f"Your appointment for **{d.service_name}** with **{d.staff_name}** "
                    f"is set for **{d.date}** at **{d.time}**.\n\n"
                    "We'll see you soon! 💇"
                )
            else:
                return (
                    f"Booking failed: {result.get('error','Unknown error')}\n"
                    "Please try again or contact us directly."
                )

        elif re.search(r"\bno\b|\bcancel\b|\bnope\b|\bna\b", text, re.I):
            reset_session(session_id)
            return "Booking cancelled. No problem! How else can I help you?"

        return "Please type **yes** to confirm or **no** to cancel."

    # Fallback
    reset_session(session_id)
    return "Something went wrong. Let's start over — how can I help you?"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _match_item(text: str, items: list, key: str):
    """Match by number (1-based) or partial name."""
    text = text.strip()

    # Number match
    m = re.match(r"^(\d+)$", text)
    if m:
        idx = int(m.group(1)) - 1
        if 0 <= idx < len(items):
            return items[idx]

    # Name match (partial, case-insensitive)
    t = text.lower()
    for item in items:
        if t in item[key].lower() or item[key].lower() in t:
            return item

    return None


def _get_free_slots(booked: list) -> list:
    """Return available 30-min slots between 8am–7pm excluding booked ones."""
    all_slots = []
    for h in range(8, 19):
        for m in (0, 30):
            all_slots.append(f"{h:02d}:{m:02d}")
    return [s for s in all_slots if s not in booked]
