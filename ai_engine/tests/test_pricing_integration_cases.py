"""Pricing conflict / unknown / official catalogue verification."""
from app.pricing_resolver import resolve_price, OFFICIAL_LENGTH_TIERS

OFFICIAL_CATALOGUE = [
    {"id": 101, "name": "Ladies Hair Cut", "price": 3500, "duration_minutes": 45, "is_active": True},
    {"id": 102, "name": "Gents Hair Cut", "price": 2000, "duration_minutes": 45, "is_active": True},
    {"id": 103, "name": "Keratin", "price": 25000, "duration_minutes": 300, "is_active": True},
    {"id": 104, "name": "Botox Hair Treatment", "price": 18000, "duration_minutes": 300, "is_active": True},
    {"id": 105, "name": "Rebonding / Relaxing", "price": 15000, "duration_minutes": 300, "is_active": True},
    {"id": 106, "name": "Highlights", "price": 15000, "duration_minutes": 300, "is_active": True},
    {"id": 291, "name": "Front Area Relax Rebonding", "price": 7000, "duration_minutes": 180, "is_active": True},
]


def test_all_keratin_tiers_match_official():
    for length, (price, mins) in OFFICIAL_LENGTH_TIERS["keratin"].items():
        q = resolve_price(f"keratin {length.replace('_', ' ')} price", OFFICIAL_CATALOGUE)
        assert q.ok and q.amount_lkr == price and q.duration_minutes == mins


def test_botox_hip_official():
    q = resolve_price("botox hip mila", OFFICIAL_CATALOGUE)
    assert q.ok and q.amount_lkr == 32000 and q.duration_minutes == 360


def test_highlights_shoulder_official():
    q = resolve_price("highlights shoulder how much", OFFICIAL_CATALOGUE)
    assert q.ok and q.amount_lkr == 15000


def test_ladies_cut_matches_official_45():
    q = resolve_price("ladies hair cut price", OFFICIAL_CATALOGUE)
    assert q.ok and q.amount_lkr == 3500 and q.duration_minutes == 45


def test_conflict_when_live_duration_wrong():
    bad = [{"id": 1, "name": "Ladies Hair Cut", "price": 3500, "duration_minutes": 75, "is_active": True}]
    q = resolve_price("how much is ladies haircut", bad)
    assert q.conflict and q.escalate and not q.ok


def test_unknown_service_no_invent():
    q = resolve_price("quantum plasma facial kiyada", OFFICIAL_CATALOGUE)
    assert not q.ok and q.amount_lkr is None


def test_singlish_keratin_asks_length():
    q = resolve_price("Keratin ekak kiyada?", OFFICIAL_CATALOGUE)
    assert q.needs_length and not q.ok
