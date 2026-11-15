"""
Customer intent → service category filtering (T28).
Regression: Hair Cut asks must never return Facials rows.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.booking_flow import (
    detect_service_category,
    resolve_catalogue_for_message,
    _filter_services_by_message,
)
from app.pricing_resolver import resolve_price

FIXTURE = Path(__file__).parent / "fixtures" / "t28_services.json"
CATALOGUE = json.loads(FIXTURE.read_text(encoding="utf-8"))

FACIAL_MARKERS = (
    "Aroma Magic Gold Facial",
    "Clean-up",
    "Fox C Peel Treatment",
    "Gold/Diamond Facial",
    "Hydra Facial",
    "Normal Facial",
)


def _cats(rows: list[dict]) -> set[str]:
    return {str(s.get("category") or "") for s in rows}


def _names(rows: list[dict]) -> list[str]:
    return [str(s.get("name") or "") for s in rows]


def _assert_no_facials(rows: list[dict]) -> None:
    joined = " | ".join(_names(rows))
    for marker in FACIAL_MARKERS:
        assert marker not in joined, f"Facial leak: {marker} in {joined}"
    for cat in _cats(rows):
        assert "facial" not in cat.lower(), f"Facial category leak: {cat}"


@pytest.mark.parametrize(
    "msg,intent",
    [
        ("Mata hair cut ekak oni", "haircut"),
        ("Hair cut ekak kara ganna oni", "haircut"),
        ("Mata hair cut ekak kara ganna oni", "haircut"),
        ("I need a haircut", "haircut"),
        ("Mata facial ekak oni", "facial"),
        ("Keratin karanna oni", "keratin"),
        ("Hair colour karanna oni", "color"),
        ("Hair straight karanna oni", "straightening"),
        ("Waxing karanna oni", "waxing"),
        ("Eyebrow shape karanna oni", "eyebrow"),
        ("Clean up ekak karanna oni", "cleanup"),
        ("Layer cut thiyenawada?", "haircut"),
    ],
)
def test_detect_category_multilingual(msg, intent):
    assert detect_service_category(msg) == intent


@pytest.mark.parametrize(
    "msg",
    [
        "Mata hair cut ekak oni",
        "Hair cut ekak kara ganna oni",
        "Mata hair cut ekak kara ganna oni",
        "I need a haircut",
        "hair cut ekak karaganna oni",
    ],
)
def test_haircut_never_returns_facials(msg):
    intent, rows = resolve_catalogue_for_message(msg, CATALOGUE)
    assert intent == "haircut"
    assert rows, "Hair Cut catalogue must return verified Hair Cut rows"
    assert _cats(rows) == {"Hair Cut"}
    _assert_no_facials(rows)


def test_facial_only_facials():
    intent, rows = resolve_catalogue_for_message("Mata facial ekak oni", CATALOGUE)
    assert intent == "facial"
    assert rows
    for cat in _cats(rows):
        assert "facial" in cat.lower()
    assert not any("Hair Cut" == c for c in _cats(rows))


def test_keratin_only_hair_treatment():
    intent, rows = resolve_catalogue_for_message("Keratin karanna oni", CATALOGUE)
    assert intent == "keratin"
    assert rows
    assert all("Hair Treatment" == c for c in _cats(rows))
    _assert_no_facials(rows)
    assert any("keratin" in n.lower() for n in _names(rows))


def test_hair_colour_not_haircut_or_facial():
    intent, rows = resolve_catalogue_for_message("Hair colour karanna oni", CATALOGUE)
    assert intent == "color"
    assert rows
    for cat in _cats(rows):
        assert "hair cut" not in cat.lower()
        assert "facial" not in cat.lower()


def test_layer_cut_no_match_does_not_dump_facials():
    intent, rows = resolve_catalogue_for_message("Layer cut thiyenawada?", CATALOGUE)
    assert intent == "haircut"
    # Fixture has no Layer Cut — empty is correct; never Facials
    assert rows == [] or all(c == "Hair Cut" for c in _cats(rows))
    _assert_no_facials(rows)


def test_category_switch_haircut_to_facial():
    cut_intent, cut_rows = resolve_catalogue_for_message(
        "Mata hair cut ekak kara ganna oni", CATALOGUE
    )
    assert cut_intent == "haircut"
    _assert_no_facials(cut_rows)

    fac_intent, fac_rows = resolve_catalogue_for_message("Na, mata facial ekak oni", CATALOGUE)
    assert fac_intent == "facial"
    assert fac_rows
    assert all("facial" in c.lower() for c in _cats(fac_rows))
    assert not any(c == "Hair Cut" for c in _cats(fac_rows))


def test_price_after_haircut_selection_uses_resolver():
    # Ladies Hair Cut is a verified Hair Cut row
    q = resolve_price("Ladies Hair Cut price kiyada?", CATALOGUE)
    assert q.ok
    assert q.amount_lkr is not None
    # Must match catalogue — not invented
    ladies = next(s for s in CATALOGUE if s.get("name") == "Ladies Hair Cut")
    assert int(q.amount_lkr) == int(ladies["price"])


def test_ambiguous_category_returns_empty_not_full_dump():
    intent, rows = resolve_catalogue_for_message("mata wedak oni", CATALOGUE)
    assert intent is None
    # Stop-token-only / vague → no full catalogue dump
    assert len(rows) < len(CATALOGUE)


def test_no_match_in_category_empty():
    # Specific style absent from T28 Hair Cut
    intent, rows = resolve_catalogue_for_message("pixie cut thiyenawada?", CATALOGUE)
    assert intent == "haircut"
    assert rows == []


def test_duplicate_names_respect_category_boundary():
    # Build a mini catalogue with same display name in two categories
    dup = [
        {"id": 1, "name": "Normal Facial", "category": "Facials", "price": 1000, "is_active": True},
        {"id": 2, "name": "Normal Facial", "category": "Hair Cut", "price": 9999, "is_active": True},
        {"id": 3, "name": "Ladies Hair Cut", "category": "Hair Cut", "price": 3500, "is_active": True},
    ]
    intent, rows = resolve_catalogue_for_message("Mata hair cut ekak oni", dup)
    assert intent == "haircut"
    assert all(s.get("category") == "Hair Cut" for s in rows)
    assert not any(s.get("id") == 1 for s in rows)


@pytest.mark.parametrize(
    "msg,allowed_substr",
    [
        ("Mata hair cut ekak oni", ("hair cut",)),
        ("I need a haircut", ("hair cut",)),
        ("Mata facial ekak oni", ("facial",)),
        ("Waxing karanna oni", ("waxing",)),
        ("Eyebrow shape karanna oni", ("threading", "waxing")),
        ("Clean up ekak karanna oni", ("facial",)),
    ],
)
def test_filter_categories_only_allowed(msg, allowed_substr):
    rows = _filter_services_by_message(msg, CATALOGUE)
    assert rows, f"expected matches for {msg!r}"
    for cat in _cats(rows):
        assert any(a in cat.lower() for a in allowed_substr), f"{cat} not in {allowed_substr}"


def test_reproduced_bug_message_haircut_not_facial_list():
    """Exact production bug phrase must not surface the Facials shortlist."""
    msg = "Mata hair cut ekak kara ganna oni"
    intent, rows = resolve_catalogue_for_message(msg, CATALOGUE)
    assert intent == "haircut"
    names = _names(rows)
    for bad in FACIAL_MARKERS:
        assert bad not in names
    assert any("Hair Cut" in (s.get("category") or "") for s in rows)
