"""Phase 2 local — pricing resolver accuracy tests."""
from app.pricing_resolver import (
    detect_length,
    resolve_price,
    quote_length_tier,
    OFFICIAL_LENGTH_TIERS,
)

CATALOGUE = [
    {"id": 1, "name": "Ladies Hair Cut", "price": 3500, "duration_minutes": 45, "is_active": True},
    {"id": 2, "name": "Gents Hair Cut", "price": 2000, "duration_minutes": 45, "is_active": True},
    {"id": 3, "name": "Keratin", "price": 25000, "duration_minutes": 300, "is_active": True},
    {"id": 4, "name": "Botox Hair Treatment", "price": 18000, "duration_minutes": 300, "is_active": True},
    {"id": 5, "name": "Rebonding / Relaxing", "price": 15000, "duration_minutes": 300, "is_active": True},
    {"id": 196, "name": "Front Area (Relax/Rebonding)", "price": 7000, "duration_minutes": 90, "is_active": False},
    {"id": 291, "name": "Front Area Relax Rebonding", "price": 7000, "duration_minutes": 180, "is_active": True},
]


def test_detect_length_variants():
    assert detect_length("bra strap") == "bra_strap"
    assert detect_length("Shoulder length") == "shoulder"
    assert detect_length("hip") == "hip"


def test_keratin_asks_length_first():
    q = resolve_price("Keratin ekak kiyada?", CATALOGUE)
    assert q.needs_length and not q.ok
    assert "shoulder" in q.message_sg.lower() or "Shoulder" in q.message_en


def test_keratin_bra_strap_official():
    q = resolve_price("keratin bra strap mila", CATALOGUE)
    assert q.ok
    assert q.amount_lkr == OFFICIAL_LENGTH_TIERS["keratin"]["bra_strap"][0]
    assert q.duration_minutes == OFFICIAL_LENGTH_TIERS["keratin"]["bra_strap"][1]
    assert q.needs_confirmation  # guide price


def test_ladies_haircut_fixed():
    q = resolve_price("How much is a ladies haircut?", CATALOGUE)
    assert q.ok and q.amount_lkr == 3500 and q.duration_minutes == 45


def test_ladies_haircut_duration_conflict_escalates():
    bad = [{"id": 1, "name": "Ladies Hair Cut", "price": 3500, "duration_minutes": 75, "is_active": True}]
    q = resolve_price("ladies hair cut price", bad)
    assert not q.ok and q.conflict and q.escalate


def test_rebonding_ignores_front_area_sku():
    # Active Front Area Relax Rebonding must not collide with full rebonding shoulder tier
    q2 = resolve_price("rebonding shoulder price", CATALOGUE)
    assert q2.ok and q2.amount_lkr == 15000 and q2.duration_minutes == 300
    assert not q2.conflict


def test_never_invent_unknown():
    q = resolve_price("quantum laser facial price?", CATALOGUE)
    assert not q.ok
