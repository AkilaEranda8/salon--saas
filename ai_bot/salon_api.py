"""
Async client that calls the existing Salon Node.js API endpoints.
Supports both public (no auth) and authenticated (JWT token) endpoints.
"""
import os
from datetime import date
import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

SALON_BASE = os.getenv("SALON_API_URL", "http://localhost:5000/api")

_client = httpx.AsyncClient(timeout=10.0)


def _auth_headers(token: str | None) -> dict:
    if not token:
        return {}
    # Backend accepts Bearer (web/mobile) and cookie token
    return {
        "Authorization": f"Bearer {token}",
        "Cookie": f"token={token}",
    }


async def get_branches(tenant_id: int | None = None) -> list:
    try:
        params = {}
        if tenant_id:
            params['tenantId'] = tenant_id
        r = await _client.get(f"{SALON_BASE}/public/branches", params=params)
        r.raise_for_status()
        return r.json()
    except Exception:
        return []


async def get_services(tenant_id: int | None = None) -> list:
    try:
        params = {}
        if tenant_id:
            params['tenantId'] = tenant_id
        r = await _client.get(f"{SALON_BASE}/public/services", params=params)
        r.raise_for_status()
        return r.json()
    except Exception:
        return []


async def get_staff(branch_id: int | None = None, tenant_id: int | None = None) -> list:
    try:
        params = {}
        if branch_id:
            params['branchId'] = branch_id
        if tenant_id:
            params['tenantId'] = tenant_id
        r = await _client.get(f"{SALON_BASE}/public/staff", params=params)
        r.raise_for_status()
        return r.json()
    except Exception:
        return []


async def get_availability(staff_id: int, date: str, tenant_id: int | None = None) -> list:
    """Returns list of already-booked HH:MM time strings for that staff+date."""
    try:
        params = {'staffId': staff_id, 'date': date}
        if tenant_id:
            params['tenantId'] = tenant_id
        r = await _client.get(
            f"{SALON_BASE}/public/availability",
            params=params,
        )
        r.raise_for_status()
        return r.json()
    except Exception:
        return []


# ── Authenticated management endpoints ───────────────────────────────────────

async def get_today_appointments(token: str, branch_id: int | None = None) -> list:
    try:
        today = date.today().isoformat()
        params = {"from": today, "to": today, "limit": 100}
        if branch_id:
            params["branchId"] = branch_id
        r = await _client.get(
            f"{SALON_BASE}/appointments",
            params=params,
            headers=_auth_headers(token),
        )
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])
    except Exception:
        return []


async def get_pending_appointments(token: str, branch_id: int | None = None) -> list:
    try:
        params = {"status": "pending", "limit": 50}
        if branch_id:
            params["branchId"] = branch_id
        r = await _client.get(
            f"{SALON_BASE}/appointments",
            params=params,
            headers=_auth_headers(token),
        )
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])
    except Exception:
        return []


async def get_today_payments(token: str, branch_id: int | None = None) -> list:
    try:
        today = date.today().isoformat()
        params = {"from": today, "to": today, "limit": 100}
        if branch_id:
            params["branchId"] = branch_id
        r = await _client.get(
            f"{SALON_BASE}/payments",
            params=params,
            headers=_auth_headers(token),
        )
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])
    except Exception:
        return []


async def get_staff_report(token: str, branch_id: int | None = None) -> list:
    try:
        from datetime import date
        month = date.today().strftime("%Y-%m")
        params = {"month": month}
        if branch_id:
            params["branchId"] = branch_id
        r = await _client.get(
            f"{SALON_BASE}/reports/staff",
            params=params,
            headers=_auth_headers(token),
        )
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else []
    except Exception:
        return []


async def get_low_stock(token: str, branch_id: int | None = None) -> list:
    try:
        params = {}
        if branch_id:
            params["branchId"] = branch_id
        r = await _client.get(
            f"{SALON_BASE}/inventory/low-stock",
            params=params,
            headers=_auth_headers(token),
        )
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])
    except Exception:
        return []


async def get_walkin_queue(token: str, branch_id: int | None = None) -> list:
    try:
        params = {"limit": 50}
        if branch_id:
            params["branchId"] = branch_id
        r = await _client.get(
            f"{SALON_BASE}/walkin",
            params=params,
            headers=_auth_headers(token),
        )
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else data.get("data", [])
    except Exception:
        return []


async def get_customer_count(token: str, branch_id: int | None = None) -> dict:
    try:
        params = {"limit": 1}
        if branch_id:
            params["branchId"] = branch_id
        r = await _client.get(
            f"{SALON_BASE}/customers",
            params=params,
            headers=_auth_headers(token),
        )
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict):
            return {"total": data.get("total", 0), "data": data.get("data", [])}
        return {"total": len(data), "data": data}
    except Exception:
        return {"total": 0, "data": []}


async def get_dashboard(token: str, branch_id: int | None = None) -> dict:
    try:
        params = {}
        if branch_id:
            params["branchId"] = branch_id
        r = await _client.get(
            f"{SALON_BASE}/reports/dashboard",
            params=params,
            headers=_auth_headers(token),
        )
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}


async def build_salon_snapshot(
    token: str | None,
    tenant_id: int | None = None,
    branch_id: int | None = None,
) -> str:
    """
    Compact live snapshot for Gemini / LLM so staff can ask anything
    about THEIR salon and get answers grounded in real data.
    """
    from datetime import date

    today = date.today().isoformat()
    parts: list[str] = [f"Salon live snapshot for {today} (this tenant only)."]

    try:
        services = await get_services(tenant_id=tenant_id)
        if services:
            svc_lines = []
            for s in services[:25]:
                name = s.get("name", "Service")
                price = s.get("price", s.get("amount", ""))
                dur = s.get("duration_minutes", s.get("duration", ""))
                svc_lines.append(f"- {name} | Rs.{price} | {dur} min")
            parts.append("Services:\n" + "\n".join(svc_lines))
    except Exception:
        pass

    try:
        staff = await get_staff(tenant_id=tenant_id)
        if staff:
            names = [str(s.get("name") or "Staff") for s in staff[:30]]
            parts.append("Staff: " + ", ".join(names))
    except Exception:
        pass

    try:
        branches = await get_branches(tenant_id=tenant_id)
        if branches:
            blines = []
            for b in branches[:10]:
                blines.append(f"- {b.get('name', 'Branch')} ({b.get('address') or b.get('phone') or ''})")
            parts.append("Branches:\n" + "\n".join(blines))
    except Exception:
        pass

    if not token:
        return "\n\n".join(parts)

    try:
        appts = await get_today_appointments(token, branch_id)
        parts.append(f"Today appointments count: {len(appts)}")
        for a in appts[:12]:
            t = str(a.get("time") or "")[:5]
            cust = a.get("customer_name", "Customer")
            status = a.get("status", "")
            svc = a.get("service", {})
            svc_name = svc.get("name", "") if isinstance(svc, dict) else ""
            parts.append(f"  • {t} {cust} | {svc_name} | {status}")
    except Exception:
        pass

    try:
        pending = await get_pending_appointments(token, branch_id)
        parts.append(f"Pending appointments: {len(pending)}")
    except Exception:
        pass

    try:
        payments = await get_today_payments(token, branch_id)
        total = sum(float(p.get("total_amount", 0) or 0) for p in payments)
        parts.append(f"Today payments: {len(payments)} | revenue Rs.{total:,.0f}")
    except Exception:
        pass

    try:
        dash = await get_dashboard(token, branch_id)
        if dash:
            # Keep it short — dump useful keys only
            useful = {
                k: dash.get(k)
                for k in (
                    "todayRevenue", "today_revenue", "revenue", "appointmentsToday",
                    "todayAppointments", "customers", "pendingAppointments", "walkIns",
                )
                if dash.get(k) is not None
            }
            if useful:
                parts.append("Dashboard KPIs: " + str(useful))
    except Exception:
        pass

    try:
        low = await get_low_stock(token, branch_id)
        if low:
            items = [str(i.get("name") or i.get("product_name") or "item") for i in low[:10]]
            parts.append("Low stock: " + ", ".join(items))
        else:
            parts.append("Low stock: none")
    except Exception:
        pass

    try:
        walkins = await get_walkin_queue(token, branch_id)
        parts.append(f"Walk-in queue: {len(walkins)}")
        for w in walkins[:8]:
            parts.append(
                f"  • {w.get('customer_name') or w.get('name') or 'Guest'} "
                f"| token {w.get('token') or '-'} | {w.get('status') or ''}"
            )
    except Exception:
        pass

    try:
        cust = await get_customer_count(token, branch_id)
        parts.append(f"Customers total: {cust.get('total', 0)}")
    except Exception:
        pass

    try:
        report = await get_staff_report(token, branch_id)
        if report:
            top = []
            for s in report[:8]:
                name = s.get("name") or s.get("staff_name") or "Staff"
                rev = s.get("revenue") or s.get("total") or s.get("sales") or 0
                top.append(f"{name}: Rs.{rev}")
            parts.append("Staff performance (month): " + "; ".join(top))
    except Exception:
        pass

    parts.append(
        "Answer using ONLY this snapshot and conversation. "
        "If data is missing, say so and suggest the matching dashboard page."
    )
    return "\n".join(parts)


async def create_booking(payload: dict, tenant_id: int | None = None) -> dict:
    """
    payload: branch_id, service_id, staff_id, customer_name,
             phone, date, time, notes (optional)
    """
    try:
        if tenant_id and 'tenantId' not in payload:
            payload = {**payload, 'tenantId': tenant_id}
        r = await _client.post(f"{SALON_BASE}/public/bookings", json=payload)
        r.raise_for_status()
        return {"success": True, "data": r.json()}
    except httpx.HTTPStatusError as e:
        msg = "Booking failed"
        try:
            msg = e.response.json().get("message", msg)
        except Exception:
            pass
        return {"success": False, "error": msg}
    except Exception as e:
        return {"success": False, "error": str(e)}
