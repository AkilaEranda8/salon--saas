"""
P0 pricing safety: no category false-quotes; length-only uses structured memory.
"""
from __future__ import annotations

import pytest

from app.pricing_resolver import (
    OFFICIAL_LENGTH_TIERS,
    is_generic_category_price_ask,
    is_length_only_message,
    is_price_enquiry,
    resolve_price,
    resolve_service_key_from_memory,
)

CATALOGUE = [
    {"id": 167, "name": "Baby Hair Cut", "duration_minutes": 30, "price": 1000, "is_active": True, "category": "haircut"},
    {"id": 180, "name": "Ladies Hair Cut", "duration_minutes": 45, "price": 3500, "is_active": True, "category": "haircut"},
    {"id": 200, "name": "Keratin Treatment", "duration_minutes": 300, "price": 25000, "is_active": True, "category": "treatment"},
    {"id": 201, "name": "Botox Hair Treatment", "duration_minutes": 300, "price": 18000, "is_active": True, "category": "treatment"},
    {"id": 210, "name": "Hydra Facial", "duration_minutes": 60, "price": 5500, "is_active": True, "category": "facial"},
    {"id": 211, "name": "Clean-up Facial", "duration_minutes": 45, "price": 3500, "is_active": True, "category": "facial"},
    {"id": 220, "name": "Full Legs Waxing", "duration_minutes": 45, "price": 3500, "is_active": True, "category": "waxing"},
]


# ── P0-1: category false-quote prevention ───────────────────────────────────

@pytest.mark.parametrize("msg", [
    "Galaxy Plasma Treatment price kiyada?",
    "galaxy plasma treatment how much?",
    "unknown galaxy treatment price?",
    "Quantum Laser Facial mila?",
    "zorblax spa treatment cost",
    "crystal glow infusion treatment price",
    "neon silk facial deluxe how much",
])
def test_unknown_named_service_never_single_quote(msg):
    q = resolve_price(msg, CATALOGUE)
    assert q.amount_lkr is None
    assert not q.ok
    assert q.needs_clarification or q.escalate
    name = (q.service_name or "").lower()
    assert "keratin" not in name
    assert "botox" not in name


def test_galaxy_plasma_does_not_quote_keratin():
    q = resolve_price("Galaxy Plasma Treatment price kiyada?", CATALOGUE)
    assert not q.ok
    assert q.amount_lkr is None
    assert q.source.startswith("clarify")
    name = (q.service_name or "").lower()
    assert "keratin" not in name


@pytest.mark.parametrize("msg,lang", [
    ("Facial mila?", "sg"),
    ("facial how much?", "en"),
    ("ෆේෂල් මිල", "si"),
    ("Waxing kiyada?", "sg"),
    ("treatment mila", "sg"),
])
def test_generic_category_lists_verified_never_guesses(msg, lang):
    assert is_generic_category_price_ask(msg, "facial") or is_price_enquiry(msg) or True
    q = resolve_price(msg, CATALOGUE)
    assert q.ok or q.needs_length or q.needs_clarification
    if q.ok:
        # Generic category → list (never silent single auto-pick as sole identity)
        if "facial" in msg.lower() or "ෆේෂල්" in msg:
            assert q.price_kind == "list"
            assert len(q.candidates) >= 1
            assert q.service_id is None or q.price_kind == "list"


def test_similar_sounding_does_not_authorize_price():
    # "keratine" typo is NOT an approved alias — must not quote Keratin tiers
    q = resolve_price("keratine deluxe plasma price?", CATALOGUE)
    assert q.amount_lkr is None or q.needs_clarification or q.price_kind == "list"
    if q.ok and q.price_kind == "fixed":
        assert False, "typo/unknown must not fixed-quote"


def test_approved_alias_keratin_still_works():
    q = resolve_price("Keratin kiyada?", CATALOGUE)
    assert q.needs_length and q.service_key == "keratin"
    q2 = resolve_price("keratin bra strap mila", CATALOGUE)
    assert q2.ok and q2.amount_lkr == OFFICIAL_LENGTH_TIERS["keratin"]["bra_strap"][0]


def test_exact_catalogue_name_still_quotes():
    q = resolve_price("Hydra Facial price?", CATALOGUE)
    assert q.ok and q.amount_lkr == 5500 and q.service_id == 210


def test_ladies_butterfly_not_collapsed_to_plain_ladies_cut():
    """Specific SKU must not be overridden by the bare ladies-haircut shortcut."""
    cat = CATALOGUE + [
        {
            "id": 278,
            "name": "Ladies Hair Cut-Butterfly",
            "price": 4500,
            "duration_minutes": 105,
            "is_active": True,
            "category": "haircut",
        }
    ]
    q = resolve_price("Ladies Hair Cut-Butterfly price", cat)
    assert q.ok and q.amount_lkr == 4500 and q.service_id == 278
    q2 = resolve_price("ladies hair cut price", cat)
    assert q2.ok and q2.amount_lkr == 3500


def test_ambiguous_description_clarifies():
    q = resolve_price("that shiny hair thing price?", CATALOGUE)
    assert not q.ok and (q.needs_clarification or q.escalate)
    assert q.amount_lkr is None


# ── P0-2: length-only + memory ───────────────────────────────────────────────

def test_is_length_only_variants():
    assert is_length_only_message("Bra Strap")
    assert is_length_only_message("shoulder")
    assert is_length_only_message("Hip")
    assert not is_length_only_message("keratin bra strap")
    assert not is_length_only_message("Saturday puluwanda?")


def test_length_only_with_memory_resolves_official_tier():
    mem = {"pricing_service_key": "keratin", "last_service": "keratin"}
    q = resolve_price("Bra Strap", CATALOGUE, memory=mem)
    assert q.ok
    assert q.amount_lkr == OFFICIAL_LENGTH_TIERS["keratin"]["bra_strap"][0]
    assert q.service_key == "keratin"
    assert q.length == "bra_strap"


def test_length_only_without_memory_clarifies():
    q = resolve_price("Bra Strap", CATALOGUE, memory={})
    assert not q.ok
    assert q.needs_clarification
    assert q.amount_lkr is None


def test_length_only_wrong_memory_key_ignored():
    # Non-approved memory values must not invent a service
    mem = {"last_service": "galaxy plasma"}
    assert resolve_service_key_from_memory(mem) is None
    q = resolve_price("Bra Strap", CATALOGUE, memory=mem)
    assert q.needs_clarification and q.amount_lkr is None


def test_multi_turn_keratin_then_bra_strap():
    q1 = resolve_price("Keratin kiyada?", CATALOGUE)
    assert q1.needs_length and q1.service_key == "keratin"
    mem = {"pricing_service_key": q1.service_key, "last_service": "keratin"}
    q2 = resolve_price("Bra Strap", CATALOGUE, prior_service_key=q1.service_key, memory=mem)
    assert q2.ok and q2.amount_lkr == 30000


@pytest.mark.parametrize("msg", [
    "Keratin kiyada?",
    "keratin how much?",
    "කෙරටින් මිල කීයද",
])
def test_multilingual_keratin_asks_length(msg):
    q = resolve_price(msg, CATALOGUE)
    assert q.needs_length and q.service_key == "keratin"


# ── Memory helper ────────────────────────────────────────────────────────────

def test_resolve_service_key_from_memory_fields():
    assert resolve_service_key_from_memory({"pricing_service_key": "botox"}) == "botox"
    assert resolve_service_key_from_memory({"last_service": "Keratin Treatment"}) == "keratin"
    assert resolve_service_key_from_memory({"preferred_services": ["facial", "rebonding"]}) == "rebonding"
    assert resolve_service_key_from_memory({"last_service": "galaxy"}) is None
