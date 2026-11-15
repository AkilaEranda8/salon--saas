"""
RC7 — Conversation Truth & State Consistency Engine.

Structured booking/conversation fields that Gemini must not freely overwrite.
Deterministic merge + correction rules. Asia/Colombo aware via callers.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

try:
    from zoneinfo import ZoneInfo

    try:
        COLOMBO = ZoneInfo("Asia/Colombo")
    except Exception:
        COLOMBO = timezone(timedelta(hours=5, minutes=30), name="Asia/Colombo")
except Exception:
    COLOMBO = timezone(timedelta(hours=5, minutes=30), name="Asia/Colombo")


def today_colombo() -> date:
    return datetime.now(COLOMBO).date()


@dataclass
class TruthField:
    value: Any = None
    source_message: Optional[str] = None
    confidence: float = 0.0
    confirmed: bool = False
    updated_turn: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Optional[dict]) -> "TruthField":
        if not isinstance(d, dict):
            return cls()
        return cls(
            value=d.get("value"),
            source_message=d.get("source_message"),
            confidence=float(d.get("confidence") or 0),
            confirmed=bool(d.get("confirmed")),
            updated_turn=int(d.get("updated_turn") or 0),
        )


@dataclass
class ConversationTruth:
    """Authoritative structured state for one booking conversation."""

    turn: int = 0
    current_intent: TruthField = field(default_factory=TruthField)
    selected_service_id: TruthField = field(default_factory=TruthField)
    selected_service_name: TruthField = field(default_factory=TruthField)
    proposed_services: TruthField = field(default_factory=TruthField)  # list[{id,name,duration}]
    service_corrections: TruthField = field(default_factory=TruthField)  # list of logs
    preferred_date: TruthField = field(default_factory=TruthField)
    preferred_time: TruthField = field(default_factory=TruthField)
    selected_branch: TruthField = field(default_factory=TruthField)
    service_duration: TruthField = field(default_factory=TruthField)
    availability_result: TruthField = field(default_factory=TruthField)
    pending_clarification: TruthField = field(default_factory=TruthField)
    booking_confirmation: TruthField = field(default_factory=TruthField)

    def to_dict(self) -> dict[str, Any]:
        return {
            "turn": self.turn,
            "current_intent": self.current_intent.to_dict(),
            "selected_service_id": self.selected_service_id.to_dict(),
            "selected_service_name": self.selected_service_name.to_dict(),
            "proposed_services": self.proposed_services.to_dict(),
            "service_corrections": self.service_corrections.to_dict(),
            "preferred_date": self.preferred_date.to_dict(),
            "preferred_time": self.preferred_time.to_dict(),
            "selected_branch": self.selected_branch.to_dict(),
            "service_duration": self.service_duration.to_dict(),
            "availability_result": self.availability_result.to_dict(),
            "pending_clarification": self.pending_clarification.to_dict(),
            "booking_confirmation": self.booking_confirmation.to_dict(),
        }

    @classmethod
    def from_dict(cls, d: Optional[dict]) -> "ConversationTruth":
        if not isinstance(d, dict):
            return cls()
        out = cls(turn=int(d.get("turn") or 0))
        for name in (
            "current_intent",
            "selected_service_id",
            "selected_service_name",
            "proposed_services",
            "service_corrections",
            "preferred_date",
            "preferred_time",
            "selected_branch",
            "service_duration",
            "availability_result",
            "pending_clarification",
            "booking_confirmation",
        ):
            setattr(out, name, TruthField.from_dict(d.get(name)))
        return out


def set_field(
    truth: ConversationTruth,
    name: str,
    value: Any,
    *,
    source: str,
    confidence: float = 0.8,
    confirmed: bool = False,
    force: bool = False,
) -> bool:
    """
    Merge a field. Confirmed values are not overwritten unless force=True
    or the new confidence is higher and value differs with an explicit correction.
    """
    field_obj: TruthField = getattr(truth, name)
    if (
        field_obj.confirmed
        and not force
        and field_obj.value is not None
        and value != field_obj.value
        and confidence < 0.95
    ):
        return False
    field_obj.value = value
    field_obj.source_message = (source or "")[:200]
    field_obj.confidence = confidence
    field_obj.confirmed = confirmed or field_obj.confirmed
    field_obj.updated_turn = truth.turn
    return True


def bump_turn(truth: ConversationTruth) -> None:
    truth.turn = int(truth.turn or 0) + 1


_RECALL_RE = re.compile(
    r"\b(?:kalin\s+ki[uw]w[eé]?|mama\s+ki[uw]w[aá]|oyata\s+mathaka|"
    r"mathaka\s+nadda|what\s+(?:did\s+i|service)|previously\s+selected|"
    r"selected\s+(?:service|eka)|dressing\s+ek\s+mokakd|"
    r"kiuw\s+dressing|kiwwa\s+dressing)\b"
    r"|කලින්\s*කි(?:ව්|ු)ව",
    re.I,
)

_SERVICE_CHANGE_RE = re.compile(
    r"\b(?:change\s+(?:to|service)|wena\s+service|instead\s+of|"
    r"not\s+(?:that|dressing|hair)|i\s+meant|nemei|newei|"
    r"hair\s*cut\s+(?:ekak|oni)|dressing\s+(?:newei|nemei))\b",
    re.I,
)

_ADD_SERVICE_RE = re.compile(
    r"\b(?:ekathu|add(?:ing)?|plus|together|combine|ekathukarala)\b|එකතු",
    re.I,
)

_DATE_CORRECTION_RE = re.compile(
    r"\b(?:me\s+mas(?:e|ene|a)?|labana\s+mas(?:e|a)?|next\s+months?|"
    r"this\s+months?|december|november|not\s+november|december\s+eki)\b"
    r"|මේ\s*මාස|ලබන\s*මාස",
    re.I,
)


def is_memory_recall_ask(text: str) -> bool:
    return bool(_RECALL_RE.search(text or ""))


def is_explicit_service_change(text: str) -> bool:
    return bool(_SERVICE_CHANGE_RE.search(text or ""))


def is_add_service_request(text: str) -> bool:
    return bool(_ADD_SERVICE_RE.search(text or ""))


def is_date_field_correction(text: str) -> bool:
    return bool(_DATE_CORRECTION_RE.search(text or ""))


def short_numeric_intent(
    text: str,
    *,
    expected_step: Optional[str] = None,
    last_ai_question: Optional[str] = None,
) -> str:
    """
    Classify short/numeric messages using booking step + last AI question.
    Returns: date_day | list_index | time_hour | unclear | other
    """
    raw = (text or "").strip()
    t = raw.lower()
    if not raw:
        return "unclear"

    pure = re.match(r"^\s*(\d{1,2})\s*$", raw)
    dayish = re.search(
        r"\b(\d{1,2})\b.*\b(?:kiy|kiyanne|kiynn[eé]|me\s+mas|labana|masene|date|dawasa)\b"
        r"|\b(?:me\s+mas|labana|masene).*\b(\d{1,2})\b",
        t,
        re.I,
    )
    if dayish or (pure and expected_step == "date"):
        return "date_day"
    if pure and expected_step == "time":
        return "time_hour"
    if pure and expected_step == "service":
        return "list_index"
    if pure and expected_step in ("pick",):
        return "list_index"

    last = (last_ai_question or "").lower()
    if pure:
        if re.search(r"\b(?:date|dawasa|which\s+day|koi\s+dawasa|month|mase)\b", last):
            return "date_day"
        if re.search(r"\b(?:time|vela|slot|morning|afternoon)\b", last):
            return "time_hour"
        if re.search(r"\b(?:service|option|reply\s+with\s+\d|number|thioranna|pick)\b", last):
            return "list_index"
        # Ambiguous lone number mid-booking after date was asked → prefer date
        if expected_step in ("date", "time", "name", "confirm"):
            return "date_day" if expected_step == "date" else "unclear"
        return "unclear"

    if is_date_field_correction(raw) and re.search(r"\d{1,2}", t):
        return "date_day"
    return "other"


# ── Relative date resolution (Asia/Colombo) ─────────────────────────────────

_WEEKDAY_ALIASES = {
    0: r"mon(?:day)?|sanduda|handuda|සඳුදා",
    1: r"tue(?:s(?:day)?)?|angaharuwada|angaharu|අඟහරුවාදා",
    2: r"wed(?:nesday)?|badada|badaada|බදාදා",
    3: r"thu(?:r(?:s(?:day)?)?)?|brahaspathinda|brahas|බ්‍රහස්පතින්දා",
    4: r"fri(?:day)?|sikurada|sikura|සිකුරාදා",
    5: r"sat(?:urday)?|senasurada|senasura|sani|sathiye|sathiya|sathida|සෙනසුරාදා|சனி",
    6: r"sun(?:day)?|irida|iridaa|ඉරිදා|ஞாயிறு",
}


def _match_weekday(text: str) -> Optional[int]:
    t = (text or "").lower()
    for i, pat in _WEEKDAY_ALIASES.items():
        if re.search(rf"(?:{pat})", t, re.I):
            return i
    return None


def _nth_weekday_of_month(year: int, month: int, weekday: int, n: int) -> Optional[date]:
    """n=1 → first weekday of month. Returns None if that week doesn't exist."""
    if n < 1 or n > 5:
        return None
    d = date(year, month, 1)
    # first occurrence of weekday
    delta = (weekday - d.weekday()) % 7
    first = d + timedelta(days=delta)
    result = first + timedelta(weeks=n - 1)
    if result.month != month:
        return None
    return result


def _month_shift(base: date, months: int) -> date:
    y = base.year
    m = base.month + months
    while m > 12:
        m -= 12
        y += 1
    while m < 1:
        m += 12
        y -= 1
    return date(y, m, 1)


def parse_relative_date(
    text: str,
    *,
    now: Optional[date] = None,
) -> dict[str, Any]:
    """
    Resolve relative / Singlish dates against Asia/Colombo 'now'.
    Returns {ok, date, weekday_ok, ambiguous, clarify, source}.
    """
    today = now or today_colombo()
    raw = str(text or "").strip()
    t = raw.lower()
    if not t:
        return {"ok": False, "date": None, "ambiguous": True, "clarify": "Which date?"}

    # next / this month
    next_month = bool(
        re.search(r"\b(?:labana\s+mas(?:e|a|ene)?|next\s+months?|ලබන\s*මාස)\b", t, re.I)
    )
    this_month = bool(
        re.search(r"\b(?:me\s+mas(?:e|a|ene)?|this\s+months?|මේ\s*මාස)\b", t, re.I)
    )

    # ordinal week: 1laweni / 1st / first / dewani / 2nd ...
    ordinal = None
    m_ord = re.search(
        r"\b(?:(1|first|1st|palaweni|palaveni|1laweni|1\s*laweni)"
        r"|(2|second|2nd|dewani|deweni)"
        r"|(3|third|3rd|thunweni|tunweni)"
        r"|(4|fourth|4th|hathareni))\b",
        t,
        re.I,
    )
    if m_ord:
        g = (m_ord.group(0) or "").lower()
        if g[0] == "1" or "first" in g or "pala" in g or "laweni" in g:
            ordinal = 1
        elif g[0] == "2" or "second" in g or "dewan" in g or "dewen" in g:
            ordinal = 2
        elif g[0] == "3" or "third" in g or "thun" in g or "tun" in g:
            ordinal = 3
        elif g[0] == "4" or "fourth" in g or "hathar" in g:
            ordinal = 4

    wd = _match_weekday(t)

    target_month_start = today.replace(day=1)
    if next_month:
        target_month_start = _month_shift(today, 1)
    elif this_month:
        target_month_start = today.replace(day=1)

    # First Saturday of next month, etc.
    if ordinal and wd is not None and (next_month or this_month or ordinal):
        if not next_month and not this_month:
            # "first Saturday" alone → this month if still upcoming, else next
            cand = _nth_weekday_of_month(today.year, today.month, wd, ordinal)
            if cand and cand >= today:
                target = cand
            else:
                nm = _month_shift(today, 1)
                target = _nth_weekday_of_month(nm.year, nm.month, wd, ordinal)
        else:
            target = _nth_weekday_of_month(
                target_month_start.year, target_month_start.month, wd, ordinal
            )
        if not target:
            return {
                "ok": False,
                "date": None,
                "ambiguous": True,
                "clarify": "That week/day doesn't exist in that month — which date do you want?",
            }
        if target.weekday() != wd:
            return {
                "ok": False,
                "date": None,
                "ambiguous": True,
                "clarify": "Calendar mismatch — please send an exact date (YYYY-MM-DD).",
            }
        return {
            "ok": True,
            "date": target.isoformat(),
            "weekday_ok": True,
            "ambiguous": False,
            "clarify": None,
            "source": "nth_weekday_month",
            "weekday": wd,
        }

    # Day-of-month + this/next month: "11 me masene", "11 kiy nne me masene"
    m_day = re.search(
        r"\b(\d{1,2})\b(?:\s*(?:kiy|kiyanne|kiynn[eé]|dawasa|date))?"
        r"|\b(?:me\s+mas|labana\s+mas|masene).{0,20}\b(\d{1,2})\b",
        t,
        re.I,
    )
    if m_day and (this_month or next_month or re.search(r"\bmasene\b|\bmase\b|\bmonth\b", t)):
        day_n = int(m_day.group(1) or m_day.group(2))
        if 1 <= day_n <= 31:
            base = _month_shift(today, 1) if next_month else today.replace(day=1)
            try:
                target = date(base.year, base.month, day_n)
            except ValueError:
                return {
                    "ok": False,
                    "date": None,
                    "ambiguous": True,
                    "clarify": f"Day {day_n} is not valid in that month — which date?",
                }
            if target < today:
                return {
                    "ok": False,
                    "date": None,
                    "ambiguous": True,
                    "clarify": "That date is in the past — which future date?",
                }
            return {
                "ok": True,
                "date": target.isoformat(),
                "weekday_ok": True,
                "ambiguous": False,
                "clarify": None,
                "source": "day_in_month",
            }

    # Plain next month without day → ambiguous
    if next_month and wd is None and ordinal is None and not re.search(r"\b\d{1,2}\b", t):
        return {
            "ok": False,
            "date": None,
            "ambiguous": True,
            "clarify": "Next month — which date or weekday? (e.g. first Saturday)",
        }

    return {"ok": False, "date": None, "ambiguous": False, "clarify": None, "source": None}


def validate_booking_preflight(
    *,
    service_id: Optional[int],
    duration_minutes: Optional[int],
    preferred_date: Optional[str],
    catalogue_duration: Optional[int] = None,
) -> dict[str, Any]:
    """
    Steps 1–4 of booking validation pipeline (deterministic).
    """
    errors: list[str] = []
    if not service_id:
        errors.append("missing_service_id")
    dur = int(catalogue_duration or duration_minutes or 0)
    if dur < 15:
        errors.append("invalid_duration")
    if catalogue_duration and duration_minutes and int(duration_minutes) != int(catalogue_duration):
        errors.append("duration_mismatch_vs_catalogue")
    d = None
    if preferred_date:
        try:
            d = date.fromisoformat(str(preferred_date)[:10])
            if d < today_colombo():
                errors.append("date_in_past")
        except ValueError:
            errors.append("invalid_date")
    else:
        errors.append("missing_date")
    return {
        "ok": not errors,
        "errors": errors,
        "service_id": service_id,
        "duration_minutes": dur,
        "date": preferred_date,
        "weekday": d.weekday() if d else None,
    }


def format_truth_for_prompt(truth: ConversationTruth) -> str:
    lines = [
        "CONVERSATION TRUTH (authoritative — do not invent conflicting service/date):",
        f"- Intent: {truth.current_intent.value}",
        f"- Selected service ID: {truth.selected_service_id.value}",
        f"- Selected service: {truth.selected_service_name.value}",
        f"- Duration (min): {truth.service_duration.value}",
        f"- Preferred date: {truth.preferred_date.value}",
        f"- Preferred time: {truth.preferred_time.value}",
        f"- Pending clarification: {truth.pending_clarification.value}",
        f"- Booking confirmed: {truth.booking_confirmation.value}",
    ]
    props = truth.proposed_services.value
    if isinstance(props, list) and props:
        bits = ", ".join(
            f"{p.get('id')}:{p.get('name')}" for p in props[:8] if isinstance(p, dict)
        )
        lines.append(f"- Proposed options: {bits}")
    lines.append(
        "Never replace selected_service unless the customer explicitly changes it. "
        "Never assume Ladies Hair Cut. Never claim availability without tool results."
    )
    return "\n".join(lines)
