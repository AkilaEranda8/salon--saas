"""Customer-initiated human handoff detection (keyword layer).

Deliberately requires *clear phrases* — a bare "manager", "human" or "agent" must
not trigger handoff ("manager special", "human hair", "agent orange" are fine).
"""
from __future__ import annotations

import re

_PEOPLE = r"(?:human|person|agent|manager|someone|somebody|staff|representative|owner|supervisor)"

COMPLAINT_RE = re.compile(
    r"(?:"
    # talk / speak / chat to (a|the) (real|live|human) person/agent/manager ...
    rf"\b(?:talk|speak|chat|connect|transfer)(?:\s+me)?\s+(?:to|with)\s+(?:a\s+|an\s+|the\s+|your\s+)?"
    rf"(?:real\s+|live\s+|human\s+)?{_PEOPLE}\b(?!['’]|\s+(?:hair|special))"
    # real / live person|human|agent
    r"|\b(?:real|live)\s+(?:person|human|agent|being)\b"
    r"|\bhuman\s+(?:agent|being|support|please)\b"
    # agent / manager please
    r"|\b(?:agent|manager|human)\s+please\b"
    rf"|\bplease\s+(?:get|call|bring|send|connect)\s+(?:me\s+)?(?:to\s+|with\s+)?(?:the\s+|a\s+|your\s+)?{_PEOPLE}\b(?!\s+hair)"
    r"|\b(?:i\s+)?(?:want|need)\s+(?:to\s+(?:talk|speak)\s+to\s+)?(?:a\s+|an\s+|the\s+)?(?:real\s+)?"
    r"(?:human|agent|manager)\b(?!['’]|\s+(?:hair|special|offer|deal))"
    # clear complaint / refund wording
    r"|\b(?:complaint|complain|complaining|refund|scam)\b"
    # Sinhala / Tamil (no \b — combining marks break word boundaries)
    r"|පැමිණිල්ල|මැනේජර්|මිනිසෙක්\s*ඕන|புகார்|மேலாளர்"
    r")",
    re.I,
)


def wants_human(message: str) -> bool:
    return bool(COMPLAINT_RE.search(message or ""))
