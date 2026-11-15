"""
Phase 6 — conversation quality regressions (Larvendo T28).
Local only — no live WhatsApp / no prod mutations.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.booking_flow import resolve_catalogue_for_message
from app.catalogue_quality import (
    facial_display_rows,
    facial_near_duplicate_groups,
    format_verified_branches,
    mentioned_haircut_styles,
    resolve_haircut_styles,
)
from app.customer_respect import soft_handoff_respect_reply, ensure_respectful_address, find_banned_casual
from app.main import _understand_customer_ask
from app.pricing_resolver import resolve_price

FIXTURE = Path(__file__).parent / "fixtures" / "t28_services.json"
CATALOGUE = json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_multi_style_haircut_layer_and_butterfly():
    msg = (
        "Mata hair cut options ona. Layer Cut saha Butterfly Cut thiyenawada? "
        "Price saha duration kiyanna."
    )
    styles = mentioned_haircut_styles(msg)
    assert "layer" in styles and "butterfly" in styles
    resolved = resolve_haircut_styles(msg, CATALOGUE)
    names = [str(s.get("name") or "") for s in resolved["matched"]]
    assert any("Butterfly" in n for n in names)
    assert "layer" in " ".join(resolved["missing_styles"]).lower() or "layer" in resolved["missing_styles"]
    # Must not silently substitute only Ladies Hair Cut for Butterfly
    butterfly = next(s for s in resolved["matched"] if "Butterfly" in str(s.get("name") or ""))
    assert int(butterfly["id"]) == 278
    assert int(float(butterfly["price"])) == 4500
    intent, rows = resolve_catalogue_for_message(msg, CATALOGUE)
    assert intent == "haircut"
    assert any(int(s.get("id") or 0) == 278 for s in rows)
    assert all("facial" not in str(s.get("category") or "").lower() for s in rows)


def test_butterfly_price_not_ladies_cut():
    q = resolve_price("Butterfly Cut price kiyada?", CATALOGUE)
    assert q.ok
    assert int(q.amount_lkr) == 4500
    ladies = resolve_price("Ladies Hair Cut price kiyada?", CATALOGUE)
    assert ladies.ok
    assert int(ladies.amount_lkr) == 3500
    assert int(q.amount_lkr) != int(ladies.amount_lkr)


def test_layer_cut_clarifies_not_listed():
    q = resolve_price("Layer Cut kochchara da?", CATALOGUE)
    assert not q.ok
    assert q.needs_clarification
    blob = " ".join(filter(None, [q.message_en, q.message_sg, q.message_si])).lower()
    assert "layer" in blob
    assert "3500" not in blob


def test_facial_near_duplicates_remain_distinct():
    rows = facial_display_rows(CATALOGUE)
    ids = {r["id"] for r in rows}
    # Known distinct active rows
    for sid in (294, 246, 247, 296, 230, 297, 266):
        assert sid in ids
    groups = facial_near_duplicate_groups(rows)
    assert groups, "expected near-duplicate guidance groups"
    # Never collapse hydra variants to one id
    hydra = next(g for g in groups if g["group"] == "hydra_facial")
    assert hydra["count"] >= 2
    assert len(set(hydra["ids"])) == hydra["count"]


def test_verified_branch_formatting_no_invented_hours():
    branches = [
        {
            "id": 30,
            "name": "Larvendo Kandy",
            "address": "254, William Gopallawa Mawatha,Kandy",
            "phone": "0812235955",
            "latitude": "7.2844288",
            "longitude": "80.6264556",
            "status": "active",
        }
    ]
    lines = format_verified_branches(branches)
    assert len(lines) == 1
    assert "Larvendo Kandy" in lines[0]
    assert "254, William Gopallawa Mawatha,Kandy" in lines[0]
    assert "0812235955" in lines[0]
    assert "maps.google.com" in lines[0]
    assert "NOT IN BRANCH RECORD" in lines[0]
    assert "Mon–Sat" not in lines[0]


def test_inactive_branch_excluded():
    lines = format_verified_branches(
        [{"name": "Ghost", "address": "Nope", "status": "inactive", "phone": "000"}]
    )
    assert lines == []


def test_multi_question_intent_answers_all():
    ask = _understand_customer_ask(
        "Salon eka koheda? Opening hours kiyada? Butterfly Cut price kiyada?"
    )
    assert ask["multi"] is True or ask["intent"] == "multi_question"
    must = ask["must"].lower()
    assert "location" in must or "branch" in must or ask.get("branch")
    assert "hours" in must or ask.get("hours")
    assert "price" in must or ask.get("price") or ask.get("category")


def test_handoff_wording_is_request_not_delivered():
    text = soft_handoff_respect_reply("sir", "singlish")
    assert "Sir" in text
    low = text.lower()
    assert "request" in low or "danawa" in low
    assert "gihilla thiyenawa" not in low
    assert "already delivered" not in low
    assert not find_banned_casual(text)


def test_sir_madam_no_gender_inference_no_aniwa():
    out = ensure_respectful_address(
        "Aniwa Butterfly Cut Rs 4500.",
        "sir_madam",
        "singlish",
    )
    assert "Aniwa" not in out and "aniwa" not in out.lower()
    assert "Sir/Madam" not in out


def test_topic_switch_haircut_to_location():
    a = _understand_customer_ask("Mata hair cut ekak oni")
    assert a.get("category") == "haircut" or str(a.get("intent") or "").startswith("service_")
    b = _understand_customer_ask("Koheda salon eka?")
    assert b.get("branch") or b.get("intent") == "location"


def test_no_invented_butterfly_id_mismatch():
    row = next(s for s in CATALOGUE if int(s["id"]) == 278)
    assert row["name"] == "Ladies Hair Cut-Butterfly"
    assert int(row["price"]) == 4500


@pytest.mark.parametrize(
    "lang_msg",
    [
        "Butterfly Cut price please",
        "Butterfly Cut mila kiyada?",
        "Butterfly Cut මිල කීයද?",
    ],
)
def test_butterfly_multilingual_price(lang_msg):
    q = resolve_price(lang_msg, CATALOGUE)
    assert q.ok
    assert int(q.amount_lkr) == 4500
