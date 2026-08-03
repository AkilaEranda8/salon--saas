"""Tests for booking confirm exact matching (C3)."""
from app.booking_flow import is_exact_confirm, is_exact_decline


def test_confirm_exact_tokens():
    assert is_exact_confirm("yes")
    assert is_exact_confirm("Y")
    assert is_exact_confirm("ok")
    assert is_exact_confirm("confirm")
    assert is_exact_confirm("  okay  ")


def test_confirm_rejects_substrings():
    assert not is_exact_confirm("yesterday")
    assert not is_exact_confirm("july")
    assert not is_exact_confirm("yes please book for tomorrow")


def test_decline_exact_tokens():
    assert is_exact_decline("no")
    assert is_exact_decline("cancel")
    assert is_exact_decline("nope")


def test_decline_rejects_substrings():
    assert not is_exact_decline("know")
    assert not is_exact_decline("noted")
    assert not is_exact_decline("knowledge")
