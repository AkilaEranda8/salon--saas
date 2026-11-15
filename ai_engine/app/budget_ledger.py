"""
RC8 — Atomic monthly Gemini budget ledger (Redis preferred).

Prevents concurrent turns from exceeding the hard $20 monthly cap.
Reservations are optimistic; settle/release adjusts the spent counter.
"""
from __future__ import annotations

import os
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from app.cost_router import (
    DAILY_PLANNED,
    HARD_CONV_CAP,
    MONTHLY_HARD_CAP,
    MONTHLY_PLANNED,
    SAFETY_RESERVE,
    TARGET_CONV_COST,
    WARN_CONV_COST,
)

# In-process fallback when Redis unavailable (local tests / single worker)
_LOCK = threading.Lock()
_MEM: dict[str, float] = {}
_MEM_RESERVATIONS: dict[str, dict[str, Any]] = {}
_ALERTS_FIRED: dict[str, set[int]] = {}

_RESERVE_LUA = """
local key = KEYS[1]
local reserve_key = KEYS[2]
local add = tonumber(ARGV[1])
local hard = tonumber(ARGV[2])
local res_id = ARGV[3]
local ttl = tonumber(ARGV[4])
local cur = tonumber(redis.call('GET', key) or '0')
if (cur + add) > hard then
  return {0, tostring(cur)}
end
cur = redis.call('INCRBYFLOAT', key, add)
redis.call('SET', reserve_key, tostring(add), 'EX', ttl)
return {1, tostring(cur)}
"""

_RELEASE_LUA = """
local key = KEYS[1]
local reserve_key = KEYS[2]
local val = redis.call('GET', reserve_key)
if not val then
  return {0, redis.call('GET', key) or '0'}
end
local amt = tonumber(val)
redis.call('INCRBYFLOAT', key, -amt)
redis.call('DEL', reserve_key)
local cur = tonumber(redis.call('GET', key) or '0')
if cur < 0 then
  redis.call('SET', key, '0')
  cur = 0
end
return {1, tostring(cur)}
"""

_SETTLE_LUA = """
local key = KEYS[1]
local reserve_key = KEYS[2]
local actual = tonumber(ARGV[1])
local val = redis.call('GET', reserve_key)
local reserved = tonumber(val or '0')
if val then
  redis.call('INCRBYFLOAT', key, actual - reserved)
  redis.call('DEL', reserve_key)
else
  redis.call('INCRBYFLOAT', key, actual)
end
local cur = tonumber(redis.call('GET', key) or '0')
if cur < 0 then
  redis.call('SET', key, '0')
  cur = 0
end
return {1, tostring(cur)}
"""


def _month_key(tenant_id: int, when: Optional[datetime] = None) -> str:
    dt = when or datetime.now(timezone.utc)
    return f"ai:budget:t{tenant_id}:{dt.strftime('%Y%m')}"


def _day_key(tenant_id: int, when: Optional[datetime] = None) -> str:
    dt = when or datetime.now(timezone.utc)
    return f"ai:budget:day:t{tenant_id}:{dt.strftime('%Y%m%d')}"


_budget_redis = None  # None=uninit, False=unavailable, else client


def _get_redis():
    """
    Dedicated short-timeout Redis for budget Lua ops.
    Falls back to memory when Redis is missing/slow so local tests never hang.
    """
    global _budget_redis
    if os.environ.get("GEMINI_BUDGET_FORCE_MEMORY", "").strip().lower() in ("1", "true", "yes"):
        return None
    if _budget_redis is not None:
        return _budget_redis if _budget_redis is not False else None
    url = (os.environ.get("REDIS_URL") or "").strip()
    if not url:
        _budget_redis = False
        return None
    try:
        import redis  # type: ignore

        client = redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=1.0,
            socket_timeout=1.5,
        )
        client.ping()
        _budget_redis = client
        return client
    except Exception:
        _budget_redis = False
        return None


@dataclass
class BudgetStatus:
    tenant_id: int
    month_key: str
    spent_usd: float
    reserved_usd: float = 0.0
    hard_cap: float = MONTHLY_HARD_CAP
    planned_usd: float = MONTHLY_PLANNED
    safety_reserve: float = SAFETY_RESERVE
    remaining_hard: float = 0.0
    remaining_planned: float = 0.0
    pct_of_hard: float = 0.0
    allow_hydrogen: bool = True
    hard_exhausted: bool = False
    alerts: list[int] = field(default_factory=list)
    daily_spent: float = 0.0
    daily_planned: float = DAILY_PLANNED

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def get_spent(tenant_id: int) -> float:
    key = _month_key(tenant_id)
    r = _get_redis()
    if r:
        try:
            return float(r.get(key) or 0)
        except Exception:
            pass
    with _LOCK:
        return float(_MEM.get(key) or 0)


def get_daily_spent(tenant_id: int) -> float:
    key = _day_key(tenant_id)
    r = _get_redis()
    if r:
        try:
            return float(r.get(key) or 0)
        except Exception:
            pass
    with _LOCK:
        return float(_MEM.get(key) or 0)


def budget_status(tenant_id: int) -> BudgetStatus:
    spent = get_spent(tenant_id)
    daily = get_daily_spent(tenant_id)
    hard = float(os.environ.get("GEMINI_MONTHLY_HARD_CAP") or MONTHLY_HARD_CAP)
    planned = float(os.environ.get("GEMINI_MONTHLY_PLANNED") or MONTHLY_PLANNED)
    pct = (spent / hard * 100.0) if hard else 0.0
    alerts = []
    for th in (70, 85, 95):
        if pct >= th:
            alerts.append(th)
    return BudgetStatus(
        tenant_id=tenant_id,
        month_key=_month_key(tenant_id),
        spent_usd=round(spent, 6),
        hard_cap=hard,
        planned_usd=planned,
        safety_reserve=round(hard - planned, 4),
        remaining_hard=round(max(0.0, hard - spent), 6),
        remaining_planned=round(max(0.0, planned - spent), 6),
        pct_of_hard=round(pct, 2),
        allow_hydrogen=spent < planned,
        hard_exhausted=spent >= hard,
        alerts=alerts,
        daily_spent=round(daily, 6),
        daily_planned=DAILY_PLANNED,
    )


def _fire_alert(tenant_id: int, pct_threshold: int, spent: float, hard: float) -> Optional[dict]:
    mk = _month_key(tenant_id)
    with _LOCK:
        fired = _ALERTS_FIRED.setdefault(mk, set())
        if pct_threshold in fired:
            return None
        fired.add(pct_threshold)
    return {
        "tool": "gemini_budget_alert",
        "ok": True,
        "tenant_id": tenant_id,
        "threshold_pct": pct_threshold,
        "spent_usd": round(spent, 6),
        "hard_cap": hard,
        "month_key": mk,
    }


def check_alerts(tenant_id: int) -> list[dict]:
    st = budget_status(tenant_id)
    out = []
    for th in st.alerts:
        a = _fire_alert(tenant_id, th, st.spent_usd, st.hard_cap)
        if a:
            out.append(a)
    return out


@dataclass
class Reservation:
    ok: bool
    reservation_id: Optional[str] = None
    amount_usd: float = 0.0
    spent_after: float = 0.0
    reason: Optional[str] = None
    status: Optional[BudgetStatus] = None

    def to_action(self) -> dict[str, Any]:
        d = {
            "tool": "gemini_budget_reserve",
            "ok": self.ok,
            "reservation_id": self.reservation_id,
            "amount_usd": self.amount_usd,
            "spent_after": self.spent_after,
            "reason": self.reason,
        }
        if self.status:
            d["status"] = {
                "spent_usd": self.status.spent_usd,
                "remaining_hard": self.status.remaining_hard,
                "allow_hydrogen": self.status.allow_hydrogen,
                "hard_exhausted": self.status.hard_exhausted,
                "pct_of_hard": self.status.pct_of_hard,
            }
        return d


def reserve(
    tenant_id: int,
    amount_usd: float,
    *,
    hard_cap: Optional[float] = None,
    ttl_sec: int = 120,
) -> Reservation:
    """
    Atomically reserve estimated cost against monthly hard cap.
    amount is clamped to HARD_CONV_CAP for a single call reservation.
    """
    hard = float(hard_cap if hard_cap is not None else (os.environ.get("GEMINI_MONTHLY_HARD_CAP") or MONTHLY_HARD_CAP))
    amt = min(max(0.0, float(amount_usd)), HARD_CONV_CAP)
    if amt <= 0:
        amt = TARGET_CONV_COST
    st = budget_status(tenant_id)
    if st.hard_exhausted:
        return Reservation(ok=False, reason="monthly_hard_cap_reached", status=st)

    res_id = f"r-{uuid.uuid4().hex[:12]}"
    month = _month_key(tenant_id)
    r = _get_redis()
    if r:
        try:
            reserve_key = f"{month}:res:{res_id}"
            result = r.eval(_RESERVE_LUA, 2, month, reserve_key, str(amt), str(hard), res_id, str(ttl_sec))
            ok = int(result[0]) == 1
            spent_after = float(result[1])
            if not ok:
                return Reservation(
                    ok=False,
                    reason="monthly_hard_cap_would_exceed",
                    spent_after=spent_after,
                    status=budget_status(tenant_id),
                )
            # day counter (best-effort)
            try:
                day = _day_key(tenant_id)
                r.incrbyfloat(day, amt)
                r.expire(day, 86400 * 3)
            except Exception:
                pass
            return Reservation(
                ok=True,
                reservation_id=res_id,
                amount_usd=amt,
                spent_after=spent_after,
                status=budget_status(tenant_id),
            )
        except Exception:
            pass

    # Memory fallback (never call budget_status while holding _LOCK — non-reentrant)
    with _LOCK:
        cur = float(_MEM.get(month) or 0)
        if cur + amt > hard:
            spent_after = cur
            ok_mem = False
        else:
            cur += amt
            _MEM[month] = cur
            _MEM_RESERVATIONS[res_id] = {"month": month, "amount": amt, "ts": time.time()}
            day = _day_key(tenant_id)
            _MEM[day] = float(_MEM.get(day) or 0) + amt
            spent_after = cur
            ok_mem = True
    if not ok_mem:
        return Reservation(
            ok=False,
            reason="monthly_hard_cap_would_exceed",
            spent_after=spent_after,
            status=budget_status(tenant_id),
        )
    return Reservation(
        ok=True,
        reservation_id=res_id,
        amount_usd=amt,
        spent_after=spent_after,
        status=budget_status(tenant_id),
    )


def settle(tenant_id: int, reservation_id: Optional[str], actual_usd: float) -> dict[str, Any]:
    """Replace reserved amount with actual estimated cost."""
    actual = max(0.0, min(float(actual_usd), HARD_CONV_CAP * 2))
    month = _month_key(tenant_id)
    r = _get_redis()
    if r and reservation_id:
        try:
            reserve_key = f"{month}:res:{reservation_id}"
            result = r.eval(_SETTLE_LUA, 2, month, reserve_key, str(actual))
            return {
                "tool": "gemini_budget_settle",
                "ok": True,
                "spent_after": float(result[1]),
                "actual_usd": actual,
                "reservation_id": reservation_id,
            }
        except Exception as exc:
            return {"tool": "gemini_budget_settle", "ok": False, "error": str(exc)[:120]}

    with _LOCK:
        if reservation_id and reservation_id in _MEM_RESERVATIONS:
            reserved = float(_MEM_RESERVATIONS.pop(reservation_id)["amount"])
            _MEM[month] = float(_MEM.get(month) or 0) - reserved + actual
        else:
            _MEM[month] = float(_MEM.get(month) or 0) + actual
        if _MEM[month] < 0:
            _MEM[month] = 0.0
        spent = _MEM[month]
    return {
        "tool": "gemini_budget_settle",
        "ok": True,
        "spent_after": spent,
        "actual_usd": actual,
        "reservation_id": reservation_id,
    }


def release(tenant_id: int, reservation_id: Optional[str]) -> dict[str, Any]:
    """Release unused reservation (call failed / skipped)."""
    if not reservation_id:
        return {"tool": "gemini_budget_release", "ok": False, "reason": "no_reservation"}
    month = _month_key(tenant_id)
    r = _get_redis()
    if r:
        try:
            reserve_key = f"{month}:res:{reservation_id}"
            result = r.eval(_RELEASE_LUA, 2, month, reserve_key)
            return {
                "tool": "gemini_budget_release",
                "ok": int(result[0]) == 1,
                "spent_after": float(result[1]),
                "reservation_id": reservation_id,
            }
        except Exception as exc:
            return {"tool": "gemini_budget_release", "ok": False, "error": str(exc)[:120]}

    with _LOCK:
        info = _MEM_RESERVATIONS.pop(reservation_id, None)
        if not info:
            return {"tool": "gemini_budget_release", "ok": False, "reason": "missing"}
        _MEM[month] = max(0.0, float(_MEM.get(month) or 0) - float(info["amount"]))
        return {
            "tool": "gemini_budget_release",
            "ok": True,
            "spent_after": _MEM[month],
            "reservation_id": reservation_id,
        }


def budget_exhausted_safe_reply(script_mode: str = "singlish") -> str:
    """Safe verified reply when monthly AI budget is exhausted — never fake-books."""
    if script_mode in ("singlish", "sinhala") or script_mode == "si":
        return (
            "Kamak naha — AI assistant eka temporary limit ekata hit una. "
            "Price / booking confirm karanna *staff* kiyala human kenekta connect wenna. "
            "Mama booking eka auto-confirm karanne naha."
        )
    return (
        "Our AI assistant has reached its monthly usage limit. "
        "Please reply *staff* to connect with a team member. "
        "I will not confirm any booking automatically."
    )
