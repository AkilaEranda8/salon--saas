"""
Phase 6 — catalogue / branch quality helpers (Larvendo T28).

Deterministic, testable. Never invents prices, styles, or addresses.
Does not merge/delete catalogue rows — display + resolution only.
"""
from __future__ import annotations

import re
from typing import Any, Optional

_NORM_RE = re.compile(r"[^a-z0-9]+")

# Named hair styles customers ask for (Singlish / English)
HAIRCUT_STYLE_TOKENS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("butterfly", re.compile(r"\bbutterfly\b", re.I)),
    ("layer", re.compile(r"\blayer(?:s|ed)?\b", re.I)),
    ("bob", re.compile(r"\bbob\b", re.I)),
    ("pixie", re.compile(r"\bpixie\b", re.I)),
    ("undercut", re.compile(r"\bundercut\b", re.I)),
    ("fade", re.compile(r"\bfade\b", re.I)),
    ("one_length", re.compile(r"\bone[\s\-]*length\b", re.I)),
    ("front_cut", re.compile(r"\bfront\s*cut\b", re.I)),
)

_GENERIC_HAIRCUT_ASK_RE = re.compile(
    r"\b(?:hair\s*cut|haircut|cut\s+options?|cut\s+eka|කට්)\b",
    re.I,
)


def _norm(s: str) -> str:
    return _NORM_RE.sub(" ", (s or "").lower()).strip()


def _blob(s: dict) -> str:
    return _norm(f"{s.get('name') or ''} {s.get('category') or ''} {s.get('description') or ''}")


def mentioned_haircut_styles(text: str) -> list[str]:
    t = text or ""
    return [name for name, pat in HAIRCUT_STYLE_TOKENS if pat.search(t)]


def resolve_haircut_styles(
    text: str,
    services: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Resolve Hair Cut style asks (possibly several in one message).

    Returns matched catalogue rows, missing style names, and whether a
    general Hair Cut listing was also requested.
    Never substitutes Ladies Hair Cut for Butterfly / Layer.
    """
    active = [s for s in services if isinstance(s, dict)]
    hair_pool = [
        s
        for s in active
        if "hair cut" in _norm(str(s.get("category") or ""))
        or re.search(r"\bcut\b|butterfly|blade|beard", _blob(s))
    ]
    # Prefer true Hair Cut category
    strict = [s for s in hair_pool if "hair cut" in _norm(str(s.get("category") or ""))]
    pool = strict or hair_pool

    styles = mentioned_haircut_styles(text)
    matched: list[dict] = []
    missing: list[str] = []
    seen_ids: set[Any] = set()

    for style in styles:
        token = style.replace("_", " ")
        hits = [s for s in pool if token in _blob(s) or style.replace("_", "") in _blob(s).replace(" ", "")]
        if style == "one_length":
            hits = [s for s in pool if "one length" in _blob(s)]
        if style == "front_cut":
            hits = [s for s in pool if "front cut" in _blob(s)]
        if hits:
            for s in hits:
                sid = s.get("id")
                if sid in seen_ids:
                    continue
                seen_ids.add(sid)
                matched.append(s)
        else:
            missing.append(style.replace("_", " "))

    wants_general = bool(_GENERIC_HAIRCUT_ASK_RE.search(text or "")) and (
        not styles or re.search(r"\boptions?\b|\blist\b|\bthiyen(?:ne|awa)|monda\b", text or "", re.I)
    )
    # If they named styles AND also asked general hair cut / options, include base cuts
    if wants_general or (not styles and _GENERIC_HAIRCUT_ASK_RE.search(text or "")):
        for s in pool:
            n = _norm(str(s.get("name") or ""))
            if n in ("ladies hair cut", "gents hair cut", "baby hair cut", "ladies one length", "front cut"):
                sid = s.get("id")
                if sid not in seen_ids:
                    seen_ids.add(sid)
                    matched.append(s)

    # Style-only ask with matches → return only matches (plus notes for missing)
    if styles and not wants_general:
        # Keep matched styles only; missing handled via notes
        pass

    notes: list[str] = []
    for m in missing:
        notes.append(
            f"Style '{m}' is NOT a separately listed live catalogue service. "
            "Do NOT quote Ladies Hair Cut (or any other cut) as that style's price. "
            "Say it is not listed separately and offer stylist confirmation / handoff."
        )
    if any(s.get("id") == 278 or "butterfly" in _norm(str(s.get("name") or "")) for s in matched):
        notes.append(
            "Butterfly is the live service 'Ladies Hair Cut-Butterfly' (verify id/price from matched rows). "
            "Never substitute plain Ladies Hair Cut price for Butterfly."
        )

    return {
        "mentioned_styles": [s.replace("_", " ") for s in styles],
        "matched": matched,
        "missing_styles": missing,
        "wants_general": bool(wants_general or (not styles and bool(pool))),
        "notes": notes,
        "pool_count": len(pool),
    }


def facial_display_rows(services: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Customer-facing facial rows with stable backend ids.
    Does NOT merge/deactivate — near-duplicates stay distinct options.
    """
    rows = [
        s
        for s in services
        if isinstance(s, dict)
        and (
            "facial" in _norm(str(s.get("category") or ""))
            or "facial" in _norm(str(s.get("name") or ""))
            or "clean up" in _norm(str(s.get("name") or ""))
            or "cleanup" in _norm(str(s.get("name") or ""))
        )
    ]
    out: list[dict[str, Any]] = []
    for s in rows:
        name = str(s.get("name") or "").strip()
        cat = str(s.get("category") or "").strip()
        display = name
        # Clarify duplicate-looking names with category suffix when helpful
        if cat and "ladies and gents" in cat.lower() and "(" not in name:
            display = f"{name} ({cat})"
        out.append(
            {
                "id": s.get("id"),
                "name": name,
                "display_name": display,
                "category": cat,
                "price": s.get("price"),
                "duration_minutes": s.get("duration_minutes"),
                "is_active": s.get("is_active", True),
            }
        )
    out.sort(key=lambda r: (_norm(str(r.get("display_name") or "")), r.get("id") or 0))
    return out


def facial_near_duplicate_groups(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group near-duplicate facial names for prompt guidance (still distinct IDs)."""
    buckets: dict[str, list[dict]] = {}
    for r in rows:
        n = _norm(str(r.get("name") or ""))
        key = n
        if "hydra" in n:
            key = "hydra_facial"
        elif "normal facial" in n:
            key = "normal_facial"
        elif "aroma magic" in n:
            key = "aroma_magic_gold"
        elif "fox c" in n:
            key = "fox_c_peel"
        elif "umecare" in n and "hydra" not in n and "clean" not in n:
            key = "umecare_facial"
        elif "clean" in n:
            key = "cleanup"
        buckets.setdefault(key, []).append(r)
    groups = []
    for key, items in buckets.items():
        if len(items) < 2:
            continue
        groups.append(
            {
                "group": key,
                "count": len(items),
                "ids": [i.get("id") for i in items],
                "labels": [f"{i.get('display_name')} [id={i.get('id')}] Rs.{i.get('price')}" for i in items],
                "guidance": (
                    "These are DISTINCT active catalogue rows (different ids/prices). "
                    "List each separately; do not merge or pick one as alias of another."
                ),
            }
        )
    return groups


def format_verified_branches(branches: list[dict[str, Any]]) -> list[str]:
    """Only verified active branch fields — never invent address/phone/hours/maps."""
    lines: list[str] = []
    for b in branches:
        if not isinstance(b, dict):
            continue
        status = str(b.get("status") or "active").lower()
        if status and status not in ("active", "open", "1", "true"):
            continue
        name = (b.get("name") or "").strip() or "Branch"
        address = (b.get("address") or "").strip()
        phone = (b.get("phone") or "").strip()
        lat, lng = b.get("latitude"), b.get("longitude")
        maps = ""
        try:
            if lat is not None and lng is not None and str(lat) and str(lng):
                maps = f"https://maps.google.com/?q={lat},{lng}"
        except Exception:
            maps = ""
        hours = (
            b.get("opening_hours")
            or b.get("business_hours")
            or b.get("hours")
            or b.get("working_hours")
        )
        line = f"- VERIFIED BRANCH: {name}"
        if address:
            line += f" | address: {address}"
        if phone:
            line += f" | phone: {phone}"
        if hours:
            line += f" | hours: {hours}"
        else:
            line += " | hours: NOT IN BRANCH RECORD — do not invent; offer staff confirmation"
        if maps:
            line += f" | maps: {maps}"
        lines.append(line)
    return lines


def style_notes_block(resolution: dict[str, Any]) -> str:
    notes = resolution.get("notes") or []
    missing = resolution.get("missing_styles") or []
    mentioned = resolution.get("mentioned_styles") or []
    bits = [
        "HAIRCUT STYLE RESOLUTION (STRICT):",
        f"Mentioned styles: {', '.join(mentioned) or '(none)'}",
        f"Missing from live catalogue: {', '.join(missing) or '(none)'}",
    ]
    bits.extend(f"- {n}" for n in notes)
    bits.append(
        "If Butterfly is matched, quote ONLY that row's price/duration. "
        "Never use plain Ladies Hair Cut (Rs 3,500) for Butterfly or Layer."
    )
    return "\n".join(bits)
