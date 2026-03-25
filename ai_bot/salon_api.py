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
    if token:
        return {"Cookie": f"token={token}"}
    return {}


async def get_branches() -> list:
    try:
        r = await _client.get(f"{SALON_BASE}/public/branches")
        r.raise_for_status()
        return r.json()
    except Exception:
        return []


async def get_services() -> list:
    try:
        r = await _client.get(f"{SALON_BASE}/public/services")
        r.raise_for_status()
        return r.json()
    except Exception:
        return []


async def get_staff(branch_id: int | None = None) -> list:
    try:
        params = {}
        if branch_id:
            params["branchId"] = branch_id
        r = await _client.get(f"{SALON_BASE}/public/staff", params=params)
        r.raise_for_status()
        return r.json()
    except Exception:
        return []


async def get_availability(staff_id: int, date: str) -> list:
    """Returns list of already-booked HH:MM time strings for that staff+date."""
    try:
        r = await _client.get(
            f"{SALON_BASE}/public/availability",
            params={"staffId": staff_id, "date": date},
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


async def create_booking(payload: dict) -> dict:
    """
    payload: branch_id, service_id, staff_id, customer_name,
             phone, date, time, notes (optional)
    """
    try:
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
