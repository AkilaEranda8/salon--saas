"""
Mandatory Sir / Madam customer respect tone for Larvendo WhatsApp AI.

- Never invent gender from a name or photo.
- Persist preference only when customer states or corrects it.
- Soft-enforce one natural honorific if the model omits it.
- Ban casual slang in customer-facing replies.
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
    r"\bsir\s+(?:kiyala|kiyanawa|kiyyanna)\b|"
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
    r"\bmadam\s+(?:kiyala|kiyanawa|kiyyanna)\b|"
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

AddressForm = str  # "sir" | "madam" | "sir_madam"


def detect_address_preference(text: str, prior: Optional[str] = None) -> Optional[str]:
    """
    Return updated preference from this message, or None if unchanged.
    Values: sir | madam
    """
    t = text or ""
    if not t.strip():
        return None
    # Corrections first (specific). "sir nemei madam kiyanna" must win as madam
    # over a naive "nemei madam" → sir reading.
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
    form: sir | madam | sir_madam
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

    # Unknown — use Sir/Madam; may ask once if never asked
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
    ask_line = ""
    if ask_once and form == "sir_madam":
        ask_line = (
            "- Address preference unknown: use Sir/Madam once, and you may politely ask "
            "ONCE how they prefer to be addressed (Sir or Madam). Do not ask again if already asked.\n"
        )
    mode = (script_mode or "").lower()
    examples = {
        "singlish": (
            f"  Singlish examples: 'Hari {label}, mama eka check karala kiyannam.' / "
            f"'Ow {label}, e service eka apita available.'\n"
        ),
        "sinhala": (
            f"  Sinhala examples: 'හරි {label}, මම ඒ ගැන පරීක්ෂා කරලා කියන්නම්.' / "
            f"'ඔව් {label}, ඒ service එක අපි ළඟ තිබෙනවා.'\n"
        ),
    }.get(mode, f"  English examples: 'Certainly, {label}. Let me check that for you.'\n")

    return (
        "CUSTOMER RESPECT TONE (MANDATORY — every customer-facing reply):\n"
        f"- Address the customer as **{label}** naturally in every reply "
        "(at least once; never more than once in the same sentence).\n"
        "- Sound like a professional salon receptionist: warm, polite, clear — not robotic.\n"
        "- NEVER use casual slang: Aniwa, Ow ow, Hari hari, Machan, Bro, Ban, Menna, Ela, "
        "dude, buddy, yako, or similar.\n"
        "- NEVER invent gender from a name, photo, or appearance.\n"
        "- If they correct Sir↔Madam, switch immediately and remember it.\n"
        f"{ask_line}"
        "- Match their language (Sinhala / Singlish / English). Answer their question first.\n"
        "- Handoff example (Singlish): "
        f"'Certainly, {label}. Mama ape team ekata danum dennam. Podi welaawak denna. "
        "Ape team member kenek oyawa contact karai.' "
        "Only promise a callback if handoff is actually queued.\n"
        f"{examples}"
    )


def contains_banned_casual(text: str) -> bool:
    return bool(_CASUAL_BANNED_RE.search(text or ""))


def find_banned_casual(text: str) -> list[str]:
    return sorted({m.group(0).lower() for m in _CASUAL_BANNED_RE.finditer(text or "")})


def strip_banned_casual(text: str) -> str:
    """Remove banned casual tokens; leave surrounding punctuation tidy."""
    if not text:
        return text
    out = _CASUAL_BANNED_RE.sub("", text)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def ensure_respectful_address(
    reply: str,
    form: AddressForm,
    script_mode: str = "english",
) -> str:
    """
    Ensure at least one Sir/Madam appears. If already present, leave wording alone
    (aside from stripping banned casual slang).
    """
    text = strip_banned_casual(reply or "").strip()
    if not text:
        text = ""
    if _HAS_HONORIFIC_RE.search(text):
        return text

    label = honorific_label(form)
    mode = (script_mode or "").lower()
    if mode == "singlish":
        prefix = f"Hari {label}, "
    elif mode in ("sinhala", "si"):
        prefix = f"හරි {label}, "
    else:
        prefix = f"Certainly, {label}. "

    # Avoid doubling if reply already starts with Hari/හරි/Yes
    if re.match(r"^(?:hari|හරි|yes|ow|ඔව්|certainly|sure)\b", text, re.I):
        # Insert honorific after first word/token
        parts = text.split(None, 1)
        if len(parts) == 2:
            return f"{parts[0]} {label}, {parts[1]}"
        return f"{parts[0]} {label}."
    return f"{prefix}{text}" if text else f"{prefix.strip()} How may I help you?"


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
    label = honorific_label(form)
    mode = (script_mode or "").lower()
    if mode == "singlish":
        return (
            f"Certainly, {label}. Mama ape team ekata danum dennam. "
            "Podi welaawak denna. Ape team member kenek oyawa contact karai."
        )
    if mode in ("sinhala", "si"):
        return (
            f"ඔව් {label}, මම අපේ team එකට දැනුම් දෙන්නම්. "
            "පොඩි වේලාවක් දෙන්න. Team member කෙනෙක් ඔබව contact කරයි."
        )
    return (
        f"Certainly, {label}. I'll notify our team now. "
        "Please give us a moment — a team member will contact you."
    )
