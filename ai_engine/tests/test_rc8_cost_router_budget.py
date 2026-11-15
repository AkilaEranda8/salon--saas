"""RC8 — model router, official pricing estimates, atomic budget ledger."""
from __future__ import annotations

from app.budget_ledger import (
    budget_exhausted_safe_reply,
    budget_status,
    release,
    reserve,
    settle,
)
from app.cost_router import (
    HARD_CONV_CAP,
    MODEL_ARGON,
    MODEL_FLASH,
    MODEL_FLASH_LITE,
    MODEL_HYDROGEN,
    MONTHLY_HARD_CAP,
    MONTHLY_PLANNED,
    classify_route_tier,
    estimate_cost_usd,
    select_model,
    trim_recent_messages,
    TIER_COMPLEX,
    TIER_LITE,
    TIER_NORMAL,
)


def test_official_models_and_no_argon_routing():
    d = select_model("hi")
    assert d.model == MODEL_FLASH_LITE
    assert d.model != MODEL_ARGON
    d2 = select_model("Mata keratin eka keeyada? Duration eka kochchara? Branch eka koheda?", ask_units=3)
    assert d2.tier in (TIER_COMPLEX, TIER_NORMAL)
    assert d2.model in (MODEL_HYDROGEN, MODEL_FLASH)
    assert MODEL_ARGON not in (d.model, d2.model)


def test_hydrogen_downgrade_at_planned_budget():
    d = select_model(
        "Compare keratin vs botox and recommend with my long history of damage and fear",
        ask_units=3,
        emotion="fear",
        monthly_spent=MONTHLY_PLANNED,
        allow_hydrogen=True,
    )
    assert d.model == MODEL_FLASH
    assert "downgraded" in d.reason or d.tier == TIER_NORMAL


def test_cost_estimate_official_rates():
    # 1M in + 1M out on lite ≈ 0.25 + 1.50
    assert abs(estimate_cost_usd(MODEL_FLASH_LITE, prompt_tokens=1_000_000, completion_tokens=1_000_000) - 1.75) < 1e-6
    # flash promo
    assert abs(estimate_cost_usd(MODEL_FLASH, prompt_tokens=1_000_000, completion_tokens=0) - 0.75) < 1e-6
    # hydrogen
    assert abs(estimate_cost_usd(MODEL_HYDROGEN, prompt_tokens=0, completion_tokens=1_000_000) - 7.5) < 1e-6


def test_tier_classification():
    assert classify_route_tier("hari") == TIER_LITE
    assert classify_route_tier("Keratin eka keeyada?") in (TIER_LITE, TIER_NORMAL)
    assert classify_route_tier("long ambiguous compare", ask_units=3, is_correction=True) == TIER_COMPLEX


def test_atomic_reserve_and_hard_cap(monkeypatch):
    monkeypatch.setenv("GEMINI_MONTHLY_HARD_CAP", "0.05")
    monkeypatch.setenv("GEMINI_BUDGET_FORCE_MEMORY", "1")
    # fresh tenant id
    tid = 28008
    r1 = reserve(tid, 0.02)
    assert r1.ok is True
    r2 = reserve(tid, 0.02)
    assert r2.ok is True
    r3 = reserve(tid, 0.02)
    assert r3.ok is False
    settle(tid, r1.reservation_id, 0.01)
    release(tid, r2.reservation_id)
    st = budget_status(tid)
    assert st.hard_cap == 0.05
    assert st.spent_usd <= 0.05 + 1e-6


def test_safe_budget_reply_never_fake_books():
    msg = budget_exhausted_safe_reply("singlish")
    assert "confirm" in msg.lower() or "staff" in msg.lower()
    assert "auto-confirm" in msg.lower() or "will not confirm" in msg.lower() or "confirm karanne naha" in msg


def test_trim_recent_messages():
    recent = [{"role": "user", "content": "x" * 2000} for _ in range(20)]
    out = trim_recent_messages(recent, max_turns=8, max_chars=100)
    assert len(out) == 8
    assert len(out[0]["content"]) == 100


def test_hard_conv_cap_constant():
    assert HARD_CONV_CAP == 0.03
    assert MONTHLY_HARD_CAP == 20.0
    assert MONTHLY_PLANNED == 16.0
