"""
Customer respect tone for Larvendo WhatsApp AI.

- Prefer Sir / Madam only when natural and needed (not every reply).
- Never invent gender from a name or photo.
- Persist preference only when customer states or corrects it.
- Ban casual slang; lightly fix common Singlish spelling slips in templates.
"""
from __future__ import annotations

import re
from typing import Any, Optional

# Explicit preference (never name-based)
_SIR_PREF_RE = re.compile(
    r"(?:"
    r"\b(?:call|address)\s+me\s+(?:as\s+)?sir\b|"
    r"\bi\s*(?:am|'m)\s+(?:a\s+)?(?:sir|gentleman|male|man)\b|"
    r"\bprefer\s+sir\b|"
    r"\bsir\s+(?:kiyala|kiyanawa|kiyanna)\b|"
    r"\bmata\s+sir\b|"
    r"\bsir\s+kiyanne?\b|"
    r"මහත්මයා|"
    r"සර්\s*කියලා"
    r")",
    re.I,
)
_MADAM_PREF_RE = re.compile(
    r"(?:"
    r"\b(?:call|address)\s+me\s+(?:as\s+)?madam\b|"
    r"\bi\s*(?:am|'m)\s+(?:a\s+)?(?:madam|lady|female|woman|miss|mrs)\b|"
    r"\bprefer\s+madam\b|"
    r"\bmadam\s+(?:kiyala|kiyanawa|kiyanna)\b|"
    r"\bmata\s+madam\b|"
    r"\bmadam\s+kiyanne?\b|"
    r"මැඩම්|"
    r"මහත්මිය"
    r")",
    re.I,
)
_CORRECT_TO_SIR_RE = re.compile(
    r"(?:"
    r"\b(?:not|nemei|nemeiya|nemeiye)\s+madam\b|"
    r"\bmadam\s+nemei\b|"
    r"\bsir\s+(?:not|nemei)\s+madam\b|"
    r"\bcall\s+me\s+sir\b|"
    r"\bsir\s+kiyanna\b"
    r")",
    re.I,
)
_CORRECT_TO_MADAM_RE = re.compile(
    r"(?:"
    r"\b(?:not|nemei|nemeiya|nemeiye)\s+sir\b|"
    r"\bsir\s+nemei\b|"
    r"\bmadam\s+(?:not|nemei)\s+sir\b|"
    r"\bcall\s+me\s+madam\b|"
    r"\bmadam\s+kiyanna\b"
    r")",
    re.I,
)

_HAS_HONORIFIC_RE = re.compile(r"\b(?:sir|madam|sir\s*/\s*madam)\b", re.I)

# Moments where an honorific is natural (used only if force_honorific=True)
_NEEDS_HONORIFIC_RE = re.compile(
    r"(?:"
    r"\b(?:welcome|thank\s+you|thanks|sorry|apolog|handoff|teammate|team\s+member|"
    r"confirm|confirmed|cancelled|rescheduled)\b|"
    r"\b(?:sthuthi|istuti|samavenna|kamak\s+naha|ayubowan)\b|"
    r"ආයුබෝවන්|ස්තුති|සමාවෙන්න"
    r")",
    re.I,
)

# Casual / overly familiar — banned in AI replies
_CASUAL_BANNED_RE = re.compile(
    r"(?:"
    r"\baniwa\b|"
    r"\bow\s+ow\b|"
    r"\bhari\s+hari\b|"
    r"\bmachan\b|"
    r"\bbro\b|"
    r"\bban\b|"
    r"\bmenna\b|"
    r"\bela\b|"
    r"\byako\b|"
    r"\bmalli\b|"
    r"\bayye\b|"
    r"\bdude\b|"
    r"\bbuddy\b"
    r")",
    re.I,
)

# Common Singlish spelling slips → cleaner Latin Singlish
_SINGLISH_SPELL_FIXES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bwelaawak\b", re.I), "welawak"),
    (re.compile(r"\bdanum\s+dennam\b", re.I), "danavum dennam"),
    (re.compile(r"\bdanum\s+denna\b", re.I), "danavum denna"),
    (re.compile(r"\bKama\s+nathi\b"), "Kamak naha"),
    (re.compile(r"\bkama\s+nathi\b", re.I), "kamak naha"),
    (re.compile(r"\bgihin\s+thiyenawa\b", re.I), "gihilla thiyenawa"),
    (re.compile(r"\bkiyyanna\b", re.I), "kiyanna"),
    (re.compile(r"\bOyaage\b"), "Oyage"),
    (re.compile(r"\boyaage\b"), "oyage"),
    (re.compile(r"\bnathnam\b", re.I), "nathnam"),  # keep common form
    (re.compile(r"\bkaragannam\b", re.I), "karagannam"),
]

AddressForm = str  # "sir" | "madam" | "sir_madam"


def detect_address_preference(text: str, prior: Optional[str] = None) -> Optional[str]:
    """Return updated preference from this message, or None if unchanged."""
    t = text or ""
    if not t.strip():
        return None
    if _CORRECT_TO_MADAM_RE.search(t):
        return "madam"
    if _CORRECT_TO_SIR_RE.search(t):
        return "sir"
    madam = bool(_MADAM_PREF_RE.search(t))
    sir = bool(_SIR_PREF_RE.search(t))
    if madam and not sir:
        return "madam"
    if sir and not madam:
        return "sir"
    return None


def resolve_address_form(
    message: str = "",
    memory: Optional[dict[str, Any]] = None,
    prior_preference: Optional[str] = None,
) -> tuple[AddressForm, Optional[str], bool]:
    """
    Returns (form, preference_to_persist_or_None, ask_once).
    Never infers from customer name.
    """
    mem = memory if isinstance(memory, dict) else {}
    stored = (
        prior_preference
        or mem.get("address_preference")
        or mem.get("honorific")
        or mem.get("preferred_title")
    )
    if isinstance(stored, str):
        stored = stored.strip().lower()
        if stored in ("sir", "madam"):
            pass
        elif stored in ("sir_madam", "sir/madam", "unknown"):
            stored = None
        else:
            stored = None

    detected = detect_address_preference(message, stored)
    if detected in ("sir", "madam"):
        return detected, detected, False

    if stored in ("sir", "madam"):
        return stored, None, False

    asked = bool(mem.get("address_preference_asked"))
    return "sir_madam", None, (not asked)


def honorific_label(form: AddressForm) -> str:
    if form == "sir":
        return "Sir"
    if form == "madam":
        return "Madam"
    return "Sir/Madam"


def respect_system_prompt_block(
    form: AddressForm,
    *,
    ask_once: bool = False,
    script_mode: str = "english",
) -> str:
    label = honorific_label(form)
    known = form in ("sir", "madam")
    ask_line = ""
    if ask_once and form == "sir_madam":
        ask_line = (
            "- Preference unknown: you may ask ONCE (politely) if they prefer Sir or Madam. "
            "Do not ask again. Until then, stay polite WITHOUT writing Sir/Madam on every line.\n"
        )
    mode = (script_mode or "").lower()
    if mode == "singlish":
        examples = (
            f"  Needed: 'Hari {label}, booking eka confirm una.' / "
            f"'Sorry {label} — eka miss una.'\n"
            "  NOT needed: short price/slot answers like "
            "'Ladies Hair Cut — Rs 3,500.' or 'Heta morning free.'\n"
            "  Spelling: use clear Singlish (welawak, danavum denna, kamak naha, oyage, kiyanna).\n"
        )
    elif mode in ("sinhala", "si"):
        examples = (
            f"  අවශ්‍ය නම්: 'හරි {label}, booking එක confirm වුණා.' — "
            "කෙටි මිල/වේලා පිළිතුරුවලට හැම වාරයේම එකතු කරන්න එපා.\n"
        )
    else:
        examples = (
            f"  Needed: 'Thank you, {label}.' / 'Sorry, {label} — let me correct that.'\n"
            "  NOT needed on every short factual answer.\n"
        )

    prefer_line = (
        f"- Known preference: prefer **{label}** when an honorific is needed.\n"
        if known
        else "- Preference unknown: do not spam Sir/Madam; be politely neutral.\n"
    )

    return (
        "CUSTOMER RESPECT TONE (mandatory):\n"
        "- Sound like a professional salon receptionist: warm, clear, polite — not robotic.\n"
        "- Use Sir/Madam ONLY when it fits: greeting, thanks, apology, confirmation, "
        "handoff, or when asking address preference.\n"
        "- Do NOT put Sir/Madam on every reply (especially short prices, slots, yes/no steps).\n"
        "- Never more than once in the same reply.\n"
        f"{prefer_line}"
        "- NEVER use casual slang: Aniwa, Ow ow, Hari hari, Machan, Bro, Ban, Menna, Ela, "
        "dude, buddy, yako, or similar.\n"
        "- NEVER invent gender from a name, photo, or appearance.\n"
        "- If they correct Sir↔Madam, switch immediately and remember it.\n"
        f"{ask_line}"
        "- Match their language (Sinhala / Singlish / English). Answer the question first.\n"
        "- Write clean Singlish spelling (not broken mashups).\n"
        f"{examples}"
    )


def contains_banned_casual(text: str) -> bool:
    return bool(_CASUAL_BANNED_RE.search(text or ""))


def find_banned_casual(text: str) -> list[str]:
    return sorted({m.group(0).lower() for m in _CASUAL_BANNED_RE.finditer(text or "")})


def strip_banned_casual(text: str) -> str:
    if not text:
        return text
    out = _CASUAL_BANNED_RE.sub("", text)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def fix_singlish_spelling(text: str) -> str:
    """Fix common Singlish spelling slips without changing meaning."""
    out = text or ""
    for pat, repl in _SINGLISH_SPELL_FIXES:
        out = pat.sub(repl, out)
    return out


def ensure_respectful_address(
    reply: str,
    form: AddressForm,
    script_mode: str = "english",
    *,
    force_honorific: bool = False,
) -> str:
    """
    Polish reply: strip banned slang + Singlish spelling fixes.
    Only inject Sir/Madam when force_honorific=True (handoff / explicit soft paths),
    or when the reply is clearly a greeting/thanks/apology AND has no honorific yet
    AND preference is known (sir/madam) — never spam Sir/Madam on every turn.
    """
    text = fix_singlish_spelling(strip_banned_casual(reply or "")).strip()
    if not text:
        return text

    if _HAS_HONORIFIC_RE.search(text):
        return text

    should_add = force_honorific
    if not should_add and form in ("sir", "madam") and _NEEDS_HONORIFIC_RE.search(text):
        # Known preference + natural moment — add once
        should_add = True

    if not should_add:
        return text

    # Unknown preference: never inject "Sir/Madam" spam unless forced (handoff)
    if form == "sir_madam" and not force_honorific:
        return text

    label = honorific_label(form)
    mode = (script_mode or "").lower()
    if mode == "singlish":
        prefix = f"Hari {label}, "
    elif mode in ("sinhala", "si"):
        prefix = f"හරි {label}, "
    else:
        prefix = f"Certainly, {label}. "

    if re.match(r"^(?:hari|හරි|yes|ow|ඔව්|certainly|sure|thank|sorry|sthuthi)\b", text, re.I):
        parts = text.split(None, 1)
        if len(parts) == 2:
            return f"{parts[0]} {label}, {parts[1]}"
        return f"{parts[0]} {label}."
    return f"{prefix}{text}"


def memory_patch_for_address(
    form: AddressForm,
    preference: Optional[str],
    *,
    ask_once: bool = False,
) -> dict[str, Any]:
    patch: dict[str, Any] = {
        "address_form": form,
    }
    if preference in ("sir", "madam"):
        patch["address_preference"] = preference
        patch["honorific"] = preference
    if ask_once:
        patch["address_preference_asked"] = True
    return patch


def soft_handoff_respect_reply(form: AddressForm, script_mode: str = "singlish") -> str:
    """
    Handoff is a necessary honorific moment.
    Wording is a REQUEST in progress — never claim the message was already delivered
    before CRM confirms queue status.
    """
    mode = (script_mode or "").lower()
    label = honorific_label(form) if form in ("sir", "madam") else None
    if mode == "singlish":
        if label:
            return (
                f"Hari {label}, mama dan team ekata request ekak danawa. "
                "Podi welawak denna — confirm una gaman team member kenek oyawa contact karai."
            )
        return (
            "Hari, mama dan team ekata request ekak danawa. "
            "Podi welawak denna — confirm una gaman team member kenek oyawa contact karai."
        )
    if mode in ("sinhala", "si"):
        if label:
            return (
                f"ඔව් {label}, මම දැන් team එකට request එකක් දානවා. "
                "පොඩි වේලාවක් දෙන්න — confirm වුණාම team member කෙනෙක් ඔබව contact කරයි."
            )
        return (
            "හරි, මම දැන් team එකට request එකක් දානවා. "
            "පොඩි වේලාවක් දෙන්න — confirm වුණාම team member කෙනෙක් ඔබව contact කරයි."
        )
    if label:
        return (
            f"Certainly, {label}. I'm requesting our team for you now. "
            "Please give us a moment — once queued, a team member will contact you."
        )
    return (
        "Certainly. I'm requesting our team for you now. "
        "Please give us a moment — once queued, a team member will contact you."
    )
