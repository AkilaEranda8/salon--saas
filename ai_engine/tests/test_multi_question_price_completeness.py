"""
Multi-question price completeness — Phase 6 RC4 local regressions.
Never invent; answer every independently answerable part.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.pricing_resolver import (
    detect_multi_price_targets,
    extract_lkr_amounts,
    resolve_multi_price_ask,
    resolve_price,
)

FIXTURE = Path(__file__).parent / "fixtures" / "t28_services.json"
CATALOGUE = json.loads(FIXTURE.read_text(encoding="utf-8"))

HAIR_MULTI = (
    "Mata hair cut ekak karaganna oni. Butterfly cut ekata kiyada? "
    "Layer cut ekath karanawada? Hair cut ekata kochchara wela yanawada?"
)
FACIAL_MULTI = (
    "Mata facial options tika kiyanna. Normal facial ekai Hydra facial ekai prices mokakda?"
)


def test_detect_hair_multi_targets():
    t = detect_multi_price_targets(HAIR_MULTI)
    assert t["butterfly"] and t["layer"] and t["duration"] and t["general_haircut"]
    assert t["count"] >= 3


def test_detect_facial_multi_targets():
    t = detect_multi_price_targets(FACIAL_MULTI)
    assert t["normal_facial"] and t["hydra_facial"]
    assert t["count"] >= 2


def test_hair_multi_includes_butterfly_layer_and_duration():
    q = resolve_price(HAIR_MULTI, CATALOGUE)
    assert q.source == "multi_price_ask"
    assert q.price_kind == "list"
    blob = " ".join([q.message_en, q.message_sg, q.message_si]).lower()
    assert "4500" in blob.replace(",", "") or "4,500" in blob
    assert "butterfly" in blob
    assert "layer" in blob
    assert "not listed" in blob or "list wela naha" in blob or "list වෙලා නැ" in blob
    assert "stylist" in blob
    # General hair cut duration present
    assert "ladies hair cut" in blob or "gents hair cut" in blob
    assert "45" in blob or "min" in blob
    # Must NOT be the old single-line only reply
    assert blob.count("rs") >= 2 or len(extract_lkr_amounts(q.message_en)) >= 2
    # Never substitute Ladies 3500 as Butterfly
    amts = extract_lkr_amounts(q.message_en)
    assert 4500 in amts
    # Layer must not invent a fake Layer amount
    assert "layer cut: rs" not in blob


def test_facial_multi_includes_normal_and_all_hydra():
    q = resolve_price(FACIAL_MULTI, CATALOGUE)
    assert q.source == "multi_price_ask"
    blob = q.message_en.lower()
    assert "normal facial" in blob
    assert "4500" in blob.replace(",", "") or "4,500" in blob
    # All distinct hydra-named rows from fixture
    hydra_ids = {
        int(s["id"])
        for s in CATALOGUE
        if "hydra" in str(s.get("name") or "").lower()
    }
    listed_ids = {int(c["id"]) for c in (q.candidates or []) if c.get("id") is not None}
    assert hydra_ids.issubset(listed_ids) or all(
        str(s.get("name") or "").lower() in blob
        for s in CATALOGUE
        if "hydra" in str(s.get("name") or "").lower()
    )
    # Distinct hydra prices should appear (6000, 8000, 10000, 14000 in fixture)
    amts = extract_lkr_amounts(q.message_en)
    assert 4500 in amts  # normal
    assert any(a in amts for a in (6000, 8000, 10000, 14000))
    # Not a single Normal Facial line only
    assert "hydra" in blob


def test_three_plus_questions_location_style_not_collapsed_by_price_only():
    # Pure price multi still complete
    msg = "Butterfly price? Layer cut thiyenawada? Ladies hair cut duration?"
    q = resolve_price(msg, CATALOGUE)
    assert q.source == "multi_price_ask"
    blob = q.message_en.lower()
    assert "butterfly" in blob and "layer" in blob


@pytest.mark.parametrize(
    "msg",
    [
        HAIR_MULTI,
        "Butterfly cut and Layer cut price please",
        "Butterfly Cut මිල සහ Layer Cut තියෙනවද?",
    ],
)
def test_multilingual_hair_multi(msg):
    q = resolve_price(msg, CATALOGUE)
    assert q.source == "multi_price_ask"
    blob = " ".join([q.message_en, q.message_sg, q.message_si]).lower()
    assert "butterfly" in blob
    assert "layer" in blob


def test_no_invented_layer_price():
    q = resolve_price("Layer Cut saha Butterfly Cut price?", CATALOGUE)
    blob = q.message_en.lower()
    assert "4500" in blob.replace(",", "") or "4,500" in blob
    # No fabricated Layer Cut: Rs X line
    assert not any(
        line.strip().lower().startswith("• layer cut: rs")
        for line in q.message_en.splitlines()
    )


def test_single_butterfly_still_short_quote():
    q = resolve_price("Butterfly Cut price kiyada?", CATALOGUE)
    assert q.ok
    assert q.source != "multi_price_ask"
    assert int(q.amount_lkr) == 4500


def test_single_normal_facial_unchanged_path():
    q = resolve_price("Normal Facial price kiyada?", CATALOGUE)
    # May be fixed or list of normal variants — must include 4500, not invent
    blob = (q.message_en or "").lower()
    assert "4500" in blob.replace(",", "") or "4,500" in blob or (
        q.amount_lkr is not None and int(q.amount_lkr) == 4500
    )


def test_resolve_multi_none_for_simple_ask():
    assert resolve_multi_price_ask("Keratin shoulder price?", CATALOGUE) is None


def test_secondary_answers_not_missing_hair():
    q = resolve_price(HAIR_MULTI, CATALOGUE)
    # Explicitly ensure all three customer asks covered
    text = q.message_sg or q.message_en
    assert "Butterfly" in text or "butterfly" in text.lower()
    assert "Layer" in text or "layer" in text.lower()
    assert "min" in text.lower()


def test_secondary_answers_not_missing_facial():
    q = resolve_price(FACIAL_MULTI, CATALOGUE)
    text = q.message_en
    assert "Normal" in text
    assert "Hydra" in text or "hydra" in text.lower()
    # More than one price line
    assert text.count("Rs") >= 2
