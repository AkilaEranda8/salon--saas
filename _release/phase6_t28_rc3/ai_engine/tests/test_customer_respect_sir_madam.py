"""Sir/Madam respect — use only when needed; Singlish spelling polish."""
from __future__ import annotations

import re

import pytest

from app.customer_respect import (
    contains_banned_casual,
    detect_address_preference,
    ensure_respectful_address,
    find_banned_casual,
    fix_singlish_spelling,
    honorific_label,
    memory_patch_for_address,
    resolve_address_form,
    respect_system_prompt_block,
    soft_handoff_respect_reply,
    strip_banned_casual,
)


@pytest.mark.parametrize(
    "msg,expected",
    [
        ("Please call me Sir", "sir"),
        ("Call me Madam", "madam"),
        ("I am a gentleman", "sir"),
        ("I'm a lady", "madam"),
        ("mata sir kiyala call karanna", "sir"),
        ("mata madam kiyanna", "madam"),
        ("sir nemei — madam kiyanna", "madam"),
        ("not sir, call me madam", "madam"),
        ("madam nemei, sir kiyanna", "sir"),
    ],
)
def test_explicit_preference_and_correction(msg, expected):
    assert detect_address_preference(msg) == expected


def test_never_infer_from_name_alone():
    form, pref, ask = resolve_address_form(
        "Hi, I want a haircut",
        memory={"customer_name": "Nimal"},
    )
    assert form == "sir_madam"
    assert pref is None
    assert ask is True


def test_stored_sir_preference():
    form, pref, ask = resolve_address_form(
        "Hair cut ekak oni",
        memory={"address_preference": "sir"},
    )
    assert form == "sir"
    assert pref is None
    assert ask is False


def test_correction_overrides_memory():
    form, pref, ask = resolve_address_form(
        "sir nemei madam kiyanna",
        memory={"address_preference": "sir"},
    )
    assert form == "madam"
    assert pref == "madam"


def test_short_price_reply_no_forced_sir_madam():
    """Do not spam Sir/Madam on every short factual reply."""
    out = ensure_respectful_address(
        "Ladies Hair Cut — Rs 3,500.",
        "sir",
        "singlish",
    )
    assert "Sir" not in out
    assert "Madam" not in out
    assert "3,500" in out


def test_unknown_preference_no_sir_madam_spam():
    out = ensure_respectful_address("Checking now.", "sir_madam", "singlish")
    assert "Sir/Madam" not in out
    assert "Sir" not in out


def test_force_honorific_for_handoff_paths():
    out = ensure_respectful_address(
        "Team ekata yawnawa.",
        "sir",
        "singlish",
        force_honorific=True,
    )
    assert "Sir" in out


def test_thanks_with_known_preference_gets_honorific():
    out = ensure_respectful_address("Thank you — booking confirmed.", "madam", "english")
    assert "Madam" in out


def test_ensure_preserves_existing_sir():
    src = "Certainly, Sir. Keratin shoulder is Rs 25,000."
    out = ensure_respectful_address(src, "sir", "english")
    assert out == src
    assert out.count("Sir") == 1


def test_banned_casual_detected_and_stripped():
    bad = "Aniwa machan, ow ow booking eka dannam. Hari hari."
    assert contains_banned_casual(bad)
    hits = find_banned_casual(bad)
    assert "aniwa" in hits
    assert "machan" in hits
    clean = strip_banned_casual(bad)
    assert not contains_banned_casual(clean)
    ensured = ensure_respectful_address(bad, "sir", "singlish")
    assert not contains_banned_casual(ensured)


def test_singlish_spelling_fixes():
    raw = "Podi welaawak denna. Mama danum dennam. Kama nathi. Message gihin thiyenawa. Oyaage kiyyanna."
    fixed = fix_singlish_spelling(raw)
    assert "welawak" in fixed
    assert "danavum dennam" in fixed
    assert "Kamak naha" in fixed or "kamak naha" in fixed
    assert "gihilla thiyenawa" in fixed
    assert "oyage" in fixed.lower()
    assert "kiyanna" in fixed
    assert "welaawak" not in fixed
    assert "kiyyanna" not in fixed


def test_system_prompt_says_not_every_reply():
    block = respect_system_prompt_block("sir", script_mode="singlish")
    assert "ONLY when" in block or "NOT needed" in block
    assert "Aniwa" in block


def test_handoff_example_respectful_singlish_spelling():
    text = soft_handoff_respect_reply("sir", "singlish")
    assert "Sir" in text
    assert "welawak" in text
    assert "request" in text.lower()
    assert "gihilla thiyenawa" not in text.lower()
    assert "welaawak" not in text
    assert not contains_banned_casual(text)


def test_handoff_unknown_preference_no_sir_madam_label():
    text = soft_handoff_respect_reply("sir_madam", "singlish")
    assert "Sir/Madam" not in text
    assert "welawak" in text


def test_memory_patch_persists_preference():
    patch = memory_patch_for_address("madam", "madam", ask_once=False)
    assert patch["address_preference"] == "madam"
    assert patch["honorific"] == "madam"


def test_long_conversation_sticky_preference():
    mem = {"address_preference": "madam"}
    for msg in ["ok", "heta morning", "price kiyada?", "book karanna", "thank you"]:
        form, pref, ask = resolve_address_form(msg, memory=mem)
        assert form == "madam"
        assert pref is None
        assert ask is False
