"""Sir/Madam customer respect tone — regression suite (local)."""
from __future__ import annotations

import re

import pytest

from app.customer_respect import (
    contains_banned_casual,
    detect_address_preference,
    ensure_respectful_address,
    find_banned_casual,
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


def test_stored_madam_preference():
    form, pref, ask = resolve_address_form(
        "Facial ekak oni",
        memory={"honorific": "madam"},
    )
    assert form == "madam"


def test_correction_overrides_memory():
    form, pref, ask = resolve_address_form(
        "sir nemei madam kiyanna",
        memory={"address_preference": "sir"},
    )
    assert form == "madam"
    assert pref == "madam"


@pytest.mark.parametrize("mode", ["english", "singlish", "sinhala"])
@pytest.mark.parametrize("form", ["sir", "madam", "sir_madam"])
def test_ensure_adds_honorific_once(mode, form):
    reply = ensure_respectful_address("We have that service available.", form, mode)
    label = honorific_label(form)
    assert label.lower() in reply.lower() or "sir/madam" in reply.lower()
    # Not robotic double in same opening
    assert not re.search(rf"\b{re.escape(label)}\b.*\b{re.escape(label)}\b", reply, re.I)


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
    assert "Sir" in ensured or "sir" in ensured.lower()


def test_system_prompt_block_mandatory():
    block = respect_system_prompt_block("sir", script_mode="singlish")
    assert "CUSTOMER RESPECT TONE" in block
    assert "Sir" in block
    assert "Aniwa" in block  # listed as banned
    assert "Machan" in block


def test_handoff_example_respectful():
    text = soft_handoff_respect_reply("sir", "singlish")
    assert "Sir" in text
    assert "team" in text.lower()
    assert not contains_banned_casual(text)


def test_memory_patch_persists_preference():
    patch = memory_patch_for_address("madam", "madam", ask_once=False)
    assert patch["address_preference"] == "madam"
    assert patch["honorific"] == "madam"
    ask_patch = memory_patch_for_address("sir_madam", None, ask_once=True)
    assert ask_patch.get("address_preference_asked") is True


@pytest.mark.parametrize(
    "msg",
    [
        "හරි මට hair cut එකක් ඕනේ",
        "Mata hair cut ekak oni",
        "I need a haircut please",
        "Keratin price kiyada?",
        "I want to speak to staff",
        "This is ridiculous, fix my booking",
    ],
)
def test_unknown_preference_uses_sir_madam(msg):
    form, pref, _ = resolve_address_form(msg, memory={})
    assert form == "sir_madam"
    assert pref is None
    out = ensure_respectful_address("Checking now.", form, "singlish")
    assert "Sir/Madam" in out or "sir/madam" in out.lower()


def test_long_conversation_sticky_preference():
    mem = {"address_preference": "madam"}
    for msg in [
        "ok",
        "heta morning",
        "price kiyada?",
        "book karanna",
        "thank you",
    ]:
        form, pref, ask = resolve_address_form(msg, memory=mem)
        assert form == "madam"
        assert pref is None
        assert ask is False
