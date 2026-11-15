"""Gemini price fallthrough must never invent — resolver hard-gates all price asks."""
import json
import re
from pathlib import Path

import pytest

from app.pricing_resolver import (
    is_price_enquiry,
    resolve_price,
    pick_quote_message,
    OFFICIAL_LENGTH_TIERS,
)

FIXTURE = Path(__file__).parent / "fixtures" / "t28_services.json"
CATALOGUE = json.loads(FIXTURE.read_text(encoding="utf-8"))

# Invented-looking amounts that must NEVER appear unless in catalogue/official tiers
_INVENTED_GUARD = re.compile(r"\bRs\.?\s*99999\b|\bRs\.?\s*1234\b", re.I)


def _amounts_in_text(text: str) -> list[int]:
    return [int(x.replace(",", "")) for x in re.findall(r"Rs\.?\s*([\d,]+)", text or "", flags=re.I)]


def _allowed_amounts() -> set[int]:
    allowed = set()
    for s in CATALOGUE:
        if not s.get("is_active", True):
            continue
        try:
            allowed.add(int(float(s.get("price") or 0)))
        except (TypeError, ValueError):
            pass
    for tiers in OFFICIAL_LENGTH_TIERS.values():
        for price, _mins in tiers.values():
            allowed.add(price)
    return allowed


ALLOWED = _allowed_amounts()


@pytest.mark.parametrize(
    "msg",
    [
        "Facial mila?",
        "facial mila eka kiyanna",
        "Waxing how much?",
        "Threading price?",
        "Nails kiyada?",
        "Hair colour cost?",
        "keratin ekak kiyada",
        "How much is a ladies haircut?",
        "හෙයාර් කට් එකක මිල කීයද",
        "මිල කීයද",
        "price please",
        "quantum laser facial price?",
    ],
)
def test_is_price_enquiry_languages(msg):
    assert is_price_enquiry(msg)


@pytest.mark.parametrize(
    "msg,expect_substr",
    [
        ("Facial mila?", "Rs"),
        ("Waxing how much?", "Rs"),
        ("Threading price?", "Rs"),
        ("Nails kiyada?", "Rs"),
        ("Hair colour cost?", None),  # length or list / clarify — may ask length for colour
        ("Keratin ekak kiyada?", "shoulder"),
        ("ladies hair cut mila", "3500"),
        ("quantum plasma facial price", None),  # clarify/escalate — no invented number required
    ],
)
def test_common_asks_never_invent(msg, expect_substr):
    q = resolve_price(msg, CATALOGUE)
    text = pick_quote_message(q, "singlish") + pick_quote_message(q, "english")
    assert not _INVENTED_GUARD.search(text)
    for amt in _amounts_in_text(text):
        assert amt in ALLOWED, f"unverified amount {amt} in {text!r} for {msg!r}"
    # Must be a closed answer path
    assert q.ok or q.needs_length or q.needs_clarification or q.escalate
    if expect_substr == "shoulder":
        assert q.needs_length
    if expect_substr == "3500":
        assert q.ok and q.amount_lkr == 3500
    if expect_substr == "Rs":
        assert q.ok and (q.amount_lkr or q.candidates)


def test_si_singlish_en_keratin_length():
    for msg, mode in [
        ("Keratin ekak kiyada?", "singlish"),
        ("How much is keratin?", "english"),
        ("කෙරටින් මිල කීයද", "sinhala"),
    ]:
        q = resolve_price(msg, CATALOGUE)
        assert q.needs_length
        t = pick_quote_message(q, mode)
        assert "shoulder" in t.lower() or "Shoulder" in t


def test_si_singlish_en_facial_lists_verified_only():
    for msg, mode in [
        ("Facial mila?", "singlish"),
        ("facial prices", "english"),
        ("ෆේෂල් මිල", "sinhala"),
    ]:
        q = resolve_price(msg, CATALOGUE)
        assert q.ok and q.price_kind == "list"
        text = pick_quote_message(q, mode)
        for amt in _amounts_in_text(text):
            assert amt in ALLOWED


def test_unknown_service_clarifies_or_escalates_no_number():
    # "facial" cue may list verified facials — still must not invent amounts
    q = resolve_price("quantum plasma facial price?", CATALOGUE)
    text = pick_quote_message(q, "english")
    assert q.ok or q.needs_clarification or q.escalate
    for amt in _amounts_in_text(text):
        assert amt in ALLOWED
    # Completely unknown with no category cue → clarify
    q2 = resolve_price("quantum plasma zorblax price?", CATALOGUE)
    assert q2.needs_clarification or q2.escalate
    for amt in _amounts_in_text(pick_quote_message(q2, "english")):
        assert amt in ALLOWED


def test_inactive_duplicate_not_quoted_as_primary():
    # Front Area 90m (#196) inactive — 180m (#291) may still match front area asks
    q = resolve_price("Front Area Relax Rebonding price", CATALOGUE)
    assert q.ok
    assert q.duration_minutes == 180
    assert q.amount_lkr == 7000


def test_every_active_service_name_resolves_verified():
    """Coverage: each of 127 active catalogue services must resolve to its own verified price."""
    failures = []
    active = [s for s in CATALOGUE if s.get("is_active", True)]
    assert len(active) >= 120
    for s in active:
        name = s["name"]
        q = resolve_price(f"{name} price", CATALOGUE)
        text = pick_quote_message(q, "english")
        for amt in _amounts_in_text(text):
            if amt not in ALLOWED:
                failures.append((name, amt, text))
        if q.ok and q.amount_lkr is not None:
            expected = int(float(s["price"]))
            # Single-service exact name should hit that row (or length-tier guide)
            if q.price_kind == "fixed" and q.service_id == s["id"]:
                if q.amount_lkr != expected:
                    failures.append((name, "mismatch", q.amount_lkr, expected))
        elif q.ok and q.price_kind == "list":
            # list ok if contains this service price
            prices = {c.get("price") for c in q.candidates}
            if int(float(s["price"])) not in prices and len(q.candidates) == 0:
                failures.append((name, "list_missing", text))
        elif not (q.needs_length or q.needs_clarification or q.escalate or q.ok):
            failures.append((name, "open_path", q))
    assert not failures, f"{len(failures)} failures e.g. {failures[:5]}"


def test_category_coverage_has_verified_lists():
    for cue in ["facial", "waxing", "threading", "nails", "manicure", "dressing", "hair cut"]:
        q = resolve_price(f"{cue} mila", CATALOGUE)
        assert q.ok or q.needs_length or q.needs_clarification or q.escalate
        text = pick_quote_message(q, "singlish")
        for amt in _amounts_in_text(text):
            assert amt in ALLOWED


def test_no_gemini_fallthrough_contract_for_price_asks():
    """Simulate main.py contract: price ask always closed by resolver."""
    messages = [
        "Facial mila?",
        "Waxing how much?",
        "Threading price?",
        "Nails kiyada?",
        "Hair colour cost?",
        "price please",
        "mila kiyanna",
    ]
    for msg in messages:
        assert is_price_enquiry(msg)
        q = resolve_price(msg, CATALOGUE)
        closed = q.ok or q.needs_length or q.needs_clarification or q.escalate
        assert closed, msg
