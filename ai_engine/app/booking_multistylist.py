"""
RC9a Phase 2.2 — multi-stylist draft helpers + add-to-existing intent.
Never invent or silently substitute a stylist.
"""
from __future__ import annotations

import re
from typing import Any, Optional


_DIFF_STYLIST_RE = re.compile(
    r"\b(?:wena\s+stylist|different\s+stylist|another\s+stylist|other\s+stylist|"
    r"mata\s+wena\s+stylist|change\s+stylist|stylist\s+kenek|"
    r"different\s+staff|another\s+staff|wena\s+kenek)\b|"
    r"වෙන\s*ස්ටයිලිස්ට්|වෙනත්\s*ස්ටයිලිස්ට්",
    re.I,
)

_ADD_EXISTING_RE = re.compile(
    r"\b(?:kalin\s+booking|existing\s+booking|my\s+booking|already\s+book|"
    r"booking\s+ekata|appointment\s+ekata|add\s+to\s+(?:my\s+)?(?:booking|appointment)|"
    r"eka\s+ekath\s+add|ekath\s+add\s+karanna|wax\s+ekath\s+danna)\b|"
    r"කලින්\s*බුකිං|බුකිං\s*එකට",
    re.I,
)

_DECLINE_ONE_KEEP_RE = re.compile(
    r"\b(?:eka\s+epa|anith\s+eka\s+thiyanna|keep\s+the\s+other|"
    r"cancel\s+one|remove\s+one|eka\s+ain)\b|"
    r"එක\s*එපා|අනිත්\s*එක",
    re.I,
)


def wants_different_stylist(text: str) -> bool:
    return bool(_DIFF_STYLIST_RE.search(str(text or "")))


def wants_add_to_existing(text: str) -> bool:
    return bool(_ADD_EXISTING_RE.search(str(text or "")))


def wants_decline_one_keep_other(text: str) -> bool:
    return bool(_DECLINE_ONE_KEEP_RE.search(str(text or "")))


def upsert_service_staff(
    draft: Any,
    service_id: int,
    staff_id: int,
    staff_name: Optional[str] = None,
) -> None:
    """Keep per-line staff on the draft. Never invent ids."""
    sid = int(service_id)
    stid = int(staff_id)
    rows = list(getattr(draft, "service_staff", None) or [])
    out = []
    found = False
    for row in rows:
        if not isinstance(row, dict):
            continue
        if int(row.get("service_id") or 0) == sid:
            out.append({
                "service_id": sid,
                "staff_id": stid,
                "staff_name": staff_name or row.get("staff_name"),
            })
            found = True
        else:
            out.append(row)
    if not found:
        out.append({"service_id": sid, "staff_id": stid, "staff_name": staff_name})
    draft.service_staff = out


def service_staff_payload(draft: Any) -> list[dict[str, int]]:
    """CRM body service_staff from draft (explicit assignments only)."""
    out: list[dict[str, int]] = []
    for row in getattr(draft, "service_staff", None) or []:
        if not isinstance(row, dict):
            continue
        sid = int(row.get("service_id") or 0)
        stid = int(row.get("staff_id") or 0)
        if sid > 0 and stid > 0:
            out.append({"service_id": sid, "staff_id": stid})
    # Ensure primary is present when header staff is set
    primary = int(getattr(draft, "service_id", 0) or 0)
    header = int(getattr(draft, "staff_id", 0) or 0)
    if primary > 0 and header > 0 and not any(r["service_id"] == primary for r in out):
        out.insert(0, {"service_id": primary, "staff_id": header})
    # Extras without explicit staff inherit header (CRM fallback) — only include if set on extra
    for x in getattr(draft, "extra_services", None) or []:
        if not isinstance(x, dict):
            continue
        xid = int(x.get("id") or 0)
        xstaff = int(x.get("staff_id") or 0)
        if xid > 0 and xstaff > 0 and not any(r["service_id"] == xid for r in out):
            out.append({"service_id": xid, "staff_id": xstaff})
    return out


def pick_staff_by_message(message: str, staff_list: list[dict]) -> Optional[dict]:
    """Match by number index or name substring. Never invent."""
    if not staff_list:
        return None
    t = str(message or "").strip()
    m = re.search(r"\b(\d{1,2})\b", t)
    if m:
        idx = int(m.group(1)) - 1
        if 0 <= idx < len(staff_list):
            return staff_list[idx]
    low = t.lower()
    for s in staff_list:
        name = str(s.get("name") or "").lower()
        if name and name in low:
            return s
    return None


def staff_eligible(staff_list: list[dict], staff_id: Optional[int]) -> bool:
    if not staff_id:
        return False
    return any(int(s.get("id") or 0) == int(staff_id) for s in staff_list)
