"""
Accurate pricing resolver — Gemini must never invent salon prices.

Precedence:
  1) Live verified active catalogue rows
  2) Official length-tier table (curated)
  3) Clarify or escalate — never invent a number

Wired into local ai_engine turn path (deploy requires separate approval).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional


# Official Larvendo length tiers (Shoulder | Bra Strap | Hip) — Rs / minutes
OFFICIAL_LENGTH_TIERS: dict[str, dict[str, tuple[int, int]]] = {
    "highlights": {
        "shoulder": (15000, 300),
        "bra_strap": (25000, 300),
        "hip": (40000, 330),
    },
    "full": {
        "shoulder": (12000, 150),
        "bra_strap": (20000, 150),
        "hip": (35000, 180),
    },
    "ombre": {
        "shoulder": (20000, 300),
        "bra_strap": (30000, 300),
        "hip": (45000, 330),
    },
    "blond": {
        "shoulder": (20000, 300),
        "bra_strap": (30000, 300),
        "hip": (45000, 330),
    },
    "keratin": {
        "shoulder": (25000, 300),
        "bra_strap": (30000, 300),
        "hip": (40000, 360),
    },
    "botox": {
        "shoulder": (18000, 300),
        "bra_strap": (22000, 300),
        "hip": (32000, 360),
    },
    "rebonding": {
        "shoulder": (15000, 300),
        "bra_strap": (25000, 300),
        "hip": (35000, 360),
    },
}

_LENGTH_SERVICE_ALIASES: list[tuple[str, re.Pattern[str]]] = [
    ("keratin", re.compile(r"\bkeratin\b|කෙරටින්", re.I)),
    ("botox", re.compile(r"\bbotox\b|බොටොක්ස්", re.I)),
    ("rebonding", re.compile(r"\brebond(?:ing)?\b|රීබොන්", re.I)),
    ("highlights", re.compile(r"\bhighlights?\b", re.I)),
    ("ombre", re.compile(r"\bombr[eé]\b", re.I)),
    ("blond", re.compile(r"\bblond(?:e)?\s*colou?r\b|\bblond(?:e)?\b|බ්ලොන්ඩ්", re.I)),
    ("full", re.compile(r"\bfull\s*(?:hair\s*)?(?:colou?r|colouring)\b", re.I)),
]

# Category cues → match live catalogue category/name
_CATEGORY_CUES: list[tuple[str, re.Pattern[str], re.Pattern[str]]] = [
    ("facial", re.compile(r"\bfacial|cleanup|clean[\s\-]*up|hydra|ෆේෂල්|පෙනහැලි", re.I), re.compile(r"facial|cleanup|clean|hydra|glow|peel|ume|aroma|spacylon|pimple", re.I)),
    ("waxing", re.compile(r"\bwax(?:ing)?\b|වැක්ස්", re.I), re.compile(r"wax", re.I)),
    ("threading", re.compile(r"\bthread(?:ing)?\b|ත්‍?රෙඩ්|ඇහිබැම", re.I), re.compile(r"thread|eyebrow|lips|chin|face", re.I)),
    ("nails", re.compile(r"\bnails?\b|acrylic|gel\s*x|නේල්", re.I), re.compile(r"nail|acrylic|gel|dipping|poly|tip", re.I)),
    ("manicure", re.compile(r"\bmanicure|pedicure|මැනිකියර්|පෙඩිකියර්", re.I), re.compile(r"manicure|pedicure|foot\s*massage|nail\s*color", re.I)),
    ("dressing", re.compile(r"\bdressing|saree|make[\s\-]*up|හේයාර්\s*ඩෝ|ඩ්‍රසින්", re.I), re.compile(r"dressing|saree|make|hair\s*style", re.I)),
    ("haircut", re.compile(r"\bhair\s*cut|haircut|trim|කට්", re.I), re.compile(r"hair\s*cut|haircut|cut|trim|beard|blade|butterfly", re.I)),
    ("colour", re.compile(r"\bcolou?r|highlights?|ombr|blond|dye|ෆැෂන්", re.I), re.compile(r"colou?r|highlight|ombr|blond|dye|fashion|crown", re.I)),
    ("treatment", re.compile(r"\btreatment|keratin|botox|rebond|spa|ප්‍රතිකාර", re.I), re.compile(r"treatment|keratin|botox|rebond|spa|perm|condition|dandruff|oil|massage", re.I)),
    ("grey", re.compile(r"\bgrey|gray|root\s*cover|ග්‍රේ", re.I), re.compile(r"grey|gray|root\s*cover|cover", re.I)),
    ("piercing", re.compile(r"\bpierc", re.I), re.compile(r"pierc", re.I)),
    ("bridal", re.compile(r"\bbridal|wedding|මනාලිය", re.I), re.compile(r"bridal|wedding|arrangement", re.I)),
]

_PRICE_CUE_RE = re.compile(
    r"(?:"
    r"\b(?:price|prices|pricing|cost|costs|how\s*much|rate|rates|fee|fees|charge|charges|"
    r"mila|mila\s*eka|gana|ganada|kiyada|keeyada|keeyak|kiyadda|price\s*eka|"
    r"ganna|කීයද|කීය|මිල|ගාන|ගණන්|விலை)\b"
    r"|\bkotaram\b|\bkotaramda\b"
    r")",
    re.I,
)

# Bare category + Singlish want often means price ("facial mila", "waxing?")
_BARE_PRICEISH_RE = re.compile(
    r"^\s*(?:facial|waxing|wax|threading|nails?|manicure|pedicure|hair\s*cut|haircut|"
    r"keratin|botox|rebonding|colour|color|highlights?|treatment|dressing|bridal|"
    r"grey|piercing)\s*(?:\?|eka|ekak|mila|price|cost)?\s*$",
    re.I,
)


@dataclass
class PriceQuote:
    ok: bool
    service_key: Optional[str] = None
    service_id: Optional[int] = None
    service_name: Optional[str] = None
    amount_lkr: Optional[int] = None
    duration_minutes: Optional[int] = None
    length: Optional[str] = None
    price_kind: str = "fixed"  # fixed | up | range | guide | list
    needs_length: bool = False
    needs_clarification: bool = False
    needs_confirmation: bool = False
    conflict: bool = False
    escalate: bool = False
    source: str = ""
    message_en: str = ""
    message_sg: str = ""
    message_si: str = ""
    candidates: list[dict[str, Any]] = field(default_factory=list)


# Customer asserts / challenges / compares a numeric price or asks discount
_PRICE_ASSERT_OR_DEAL_RE = re.compile(
    r"(?:"
    r"(?:rs\.?|lkr|රු)\s*[\d,]+"
    r"|\b(?:discount|offer|offers|special(?:s)?|promo|coupon|cheap(?:er)?|expensive|"
    r"ganak|loku\s*gana|aduma|ලාභ|වට්ටම්|කූපන්|ඔෆර්)\b"
    r"|\bis\s+(?:it|this|that)\s+(?:rs|lkr|රු|\d)"
    r"|\b(?:correct|right|true)\s+(?:price|mila|gana)"
    r")",
    re.I,
)


# Customer explicitly rejects a price/time quote ("I didn't ask for price")
_PRICE_REJECTION_RE = re.compile(
    r"(?:"
    r"\bprice\s+aka\s+newei\b|"
    r"\btime\s+aka\s+(?:price\s+aka\s+)?newei\b|"
    r"\b(?:price|mila|time|wela)\b[^\n]{0,24}\b(?:aka\s+)?(?:newei|nemei|nemeiye)\b|"
    r"\b(?:newei|nemei|nemeiye|not)\b[^\n]{0,24}\b(?:price|mila|time)\b|"
    r"\b(?:didn'?t|did\s+not|dont|don'?t)\s+ask\b[^\n]{0,40}\b(?:price|prices|time)\b|"
    r"\bi\s+(?:didn'?t|did\s+not)\s+ask\s+(?:for\s+)?(?:the\s+)?(?:price|time)\b|"
    r"\bmama\s+keewe\b[^\n]{0,60}\b(?:price|time|mila)\b[^\n]{0,24}\b(?:newei|nemei)\b|"
    r"\bnot\s+(?:the\s+)?(?:price|prices|time)\b|"
    r"මිල\s*නෙවෙි|මිල\s*නෙමෙ|කාලය\s*නෙවෙි"
    r")",
    re.I,
)


def is_price_rejection(text: str) -> bool:
    """True when customer says they did NOT ask for price/time."""
    return bool(_PRICE_REJECTION_RE.search(str(text or "")))


def is_price_enquiry(text: str) -> bool:
    """True for EN / Singlish / SI price asks (including short category+mila forms)."""
    t = (text or "").strip()
    if not t:
        return False
    # Negation wins — never hard-gate into "which service price?"
    if is_price_rejection(t):
        return False
    if _PRICE_CUE_RE.search(t):
        return True
    if _BARE_PRICEISH_RE.match(t):
        return True
    # Sinhala price particles without Latin cues
    if re.search(r"කීයද|මිල|ගානේ|ගණන්", t):
        return True
    # "Is keratin Rs 15000?" / discount / offer challenges → hard-gate
    if _PRICE_ASSERT_OR_DEAL_RE.search(t):
        return True
    return False


_LKR_AMOUNT_RE = re.compile(
    r"(?:rs\.?|lkr|රු\.?)\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,})",
    re.I,
)


def extract_lkr_amounts(text: str) -> list[int]:
    """Extract LKR/Rs amounts from customer-facing text (no invent)."""
    out: list[int] = []
    for m in _LKR_AMOUNT_RE.finditer(text or ""):
        try:
            out.append(int(m.group(1).replace(",", "")))
        except ValueError:
            continue
    return out


def official_tier_amounts() -> set[int]:
    allowed: set[int] = set()
    for tiers in OFFICIAL_LENGTH_TIERS.values():
        for price, _mins in tiers.values():
            allowed.add(int(price))
    return allowed


def validate_reply_against_verified_amounts(
    reply: str,
    *,
    allowed_amounts: Optional[set[int]] = None,
    block_any_amount: bool = False,
) -> tuple[bool, list[int], list[int]]:
    """
    Returns (ok, found_amounts, blocked_amounts).
    ok=False when reply contains LKR amounts that are not in the verified allow-list
    (or any amount when block_any_amount=True).
    """
    found = extract_lkr_amounts(reply)
    if not found:
        return True, [], []
    if block_any_amount:
        return False, found, found
    if allowed_amounts is None:
        return True, found, []
    blocked = [a for a in found if a not in allowed_amounts]
    return (len(blocked) == 0), found, blocked


def price_output_fallback(script_mode: str = "english") -> str:
    mode = (script_mode or "").lower()
    if mode == "singlish":
        return (
            "Eka price eka denata verified list eken confirm karanna bari una — "
            "team member kenek exact amount eka confirm karai. *staff* kiyanna puluwanda."
        )
    if mode in ("sinhala", "si"):
        return (
            "ඒ මිල දැන් verified list එකෙන් තහවුරු කළ නොහැක — "
            "කාර්ය මණ්ඩලයක් නිවැරදි මුදල confirm කරයි. *staff* කියන්න."
        )
    return (
        "I can't confirm that amount from our verified salon list right now — "
        "a team member will confirm the exact price. You can also say *staff*."
    )


def detect_length(text: str) -> Optional[str]:
    t = (text or "").lower()
    if re.search(r"bra[\s\-]*strap", t):
        return "bra_strap"
    if re.search(r"\bshoulder\b|ශෝල්ඩර්", t):
        return "shoulder"
    if re.search(r"\bhip\b|හිප්", t):
        return "hip"
    return None


def detect_length_service_key(text: str) -> Optional[str]:
    for key, pat in _LENGTH_SERVICE_ALIASES:
        if pat.search(text or ""):
            return key
    return None


def resolve_service_key_from_memory(memory: Optional[dict[str, Any]]) -> Optional[str]:
    """
    Structured memory → approved length-tier service key only.
    Never invents a key from free text similarity.
    """
    if not isinstance(memory, dict):
        return None
    for field in (
        "pricing_service_key",
        "length_service_key",
        "last_service",
        "current_topic",
        "last_quoted_service",
        "preferred_services",
    ):
        raw = memory.get(field)
        if isinstance(raw, list):
            for item in raw:
                key = detect_length_service_key(str(item or ""))
                if key:
                    return key
            continue
        key = detect_length_service_key(str(raw or ""))
        if key:
            return key
    return None


def is_length_only_message(text: str) -> bool:
    """True when the customer is answering with a hair-length tier alone."""
    t = (text or "").strip()
    if not t or not detect_length(t):
        return False
    if detect_length_service_key(t):
        return False
    # Allow short length answers optionally wrapped with filler
    n = _norm_name(t)
    weak = {
        "the", "a", "an", "my", "hair", "length", "eka", "ekak", "da", "than",
        "price", "mila", "please", "oya", "mage", "මගේ",
    }
    toks = [x for x in n.split() if x not in weak]
    length_toks = {"bra", "strap", "shoulder", "hip", "ශෝල්ඩර්", "හිප්"}
    return bool(toks) and all(t in length_toks or t.startswith("bra") for t in toks)


def _norm_name(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


_WEAK_PRICE_TOKENS = {
    "the", "a", "an", "and", "for", "with", "of", "to", "my", "your",
    "price", "prices", "pricing", "cost", "costs", "how", "much", "rate", "rates",
    "fee", "fees", "charge", "charges", "mila", "gana", "ganada", "kiyada", "keeyak",
    "kiyadda", "ganna", "eka", "ekak", "please", "want", "one", "me", "tell",
    "what", "is", "are", "do", "you", "have", "need", "quote",
}

# Tokens that belong to a category cue — not a distinctive service name
_CATEGORY_GENERIC_TOKENS: dict[str, set[str]] = {
    "facial": {"facial", "facials", "cleanup", "clean", "up", "hydra", "glow", "peel"},
    "waxing": {"wax", "waxing", "waxes"},
    "threading": {"thread", "threading", "eyebrow", "brows", "lips", "chin", "face"},
    "nails": {"nail", "nails", "acrylic", "gel", "dipping", "poly", "tip"},
    "manicure": {"manicure", "pedicure", "foot", "massage", "nail", "color", "colour"},
    "dressing": {"dressing", "saree", "make", "up", "makeup", "hair", "style"},
    "haircut": {"hair", "cut", "haircut", "trim", "beard", "blade"},
    "colour": {"colour", "color", "highlight", "highlights", "ombre", "blond", "blonde", "dye", "fashion"},
    "treatment": {"treatment", "treatments", "keratin", "botox", "rebond", "rebonding", "spa", "perm"},
    "grey": {"grey", "gray", "root", "cover"},
    "piercing": {"piercing", "pierce", "pierc"},
    "bridal": {"bridal", "wedding", "arrangement"},
}


def _distinctive_tokens(text: str, *, category_label: Optional[str] = None) -> set[str]:
    n = _norm_name(re.sub(_PRICE_CUE_RE, " ", text or ""))
    toks = set(n.split()) - _WEAK_PRICE_TOKENS
    if category_label:
        toks -= _CATEGORY_GENERIC_TOKENS.get(category_label, set())
    # Drop length tokens — they are not service identity
    toks -= {"shoulder", "bra", "strap", "hip", "length"}
    return toks


def is_generic_category_price_ask(text: str, category_label: str) -> bool:
    """
    True for bare category price asks (e.g. 'facial mila', 'waxing how much').
    False when the customer named a specific/unknown product (e.g. 'galaxy plasma treatment').
    """
    t = (text or "").strip()
    if not t:
        return False
    if _BARE_PRICEISH_RE.match(t):
        return True
    return len(_distinctive_tokens(t, category_label=category_label)) == 0


def _active(catalogue: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [r for r in (catalogue or []) if isinstance(r, dict) and r.get("is_active", True)]


def find_live_services(
    catalogue: list[dict[str, Any]],
    *,
    name_substr: str,
    active_only: bool = True,
) -> list[dict[str, Any]]:
    needle = _norm_name(name_substr)
    rows = _active(catalogue) if active_only else list(catalogue or [])
    return [r for r in rows if needle and needle in _norm_name(str(r.get("name") or ""))]


def _clarify_messages(hint: str = "") -> PriceQuote:
    extra = f" ({hint})" if hint else ""
    return PriceQuote(
        ok=False,
        needs_clarification=True,
        source="clarify",
        message_en=(
            f"Which service price do you need{extra}? "
            "Tell me the name (e.g. Clean-up facial, Full leg wax, Eyebrow threading) — "
            "I'll quote only from our verified salon list."
        ),
        message_sg=(
            f"Mokadda service eke price eka one{extra}? "
            "Name eka kiyanna (e.g. Clean-up facial, Full leg wax) — "
            "verified list eken witharak kiyanawa."
        ),
        message_si=(
            f"කුමන සේවාවේ මිලද{extra}? "
            "නම කියන්න (උදා: Clean-up facial) — verified list එකෙන් විතරක් කියනවා."
        ),
    )


def _escalate_messages(reason: str = "") -> PriceQuote:
    return PriceQuote(
        ok=False,
        escalate=True,
        source=f"escalate:{reason}" if reason else "escalate",
        message_en=(
            "I can't verify that price from our salon list right now. "
            "A team member will confirm the exact amount for you."
        ),
        message_sg=(
            "Eka price eka verified list eken confirm karanna bari una. "
            "Team member kenek exact amount eka confirm karai."
        ),
        message_si=(
            "ඒ මිල verified list එකෙන් තහවුරු කළ නොහැක. "
            "කාර්ය මණ්ඩලයක් නිවැරදි මුදල තහවුරු කරයි."
        ),
    )


def quote_length_tier(
    service_key: str,
    length: Optional[str],
    *,
    live_row: Optional[dict[str, Any]] = None,
) -> PriceQuote:
    tiers = OFFICIAL_LENGTH_TIERS.get(service_key)
    if not tiers:
        return _escalate_messages("no_length_tier")
    if not length:
        label = service_key.title()
        return PriceQuote(
            ok=False,
            service_key=service_key,
            needs_length=True,
            source="official_length_tiers",
            message_en=(
                f"{label} price depends on hair length. "
                "Is yours *Shoulder*, *Bra Strap*, or *Hip*?"
            ),
            message_sg=(
                f"{label} price eka hair length eken wenas wenawa. "
                "Oyaage length eka *shoulder*, *bra strap* da *hip* da?"
            ),
            message_si=(
                f"{label} මිල කෙස් දිග අනුව වෙනස් වෙනවා. "
                "ඔබේ length එක *Shoulder*, *Bra Strap* ද *Hip* ද?"
            ),
        )

    price, mins = tiers[length]
    conflict = False
    if live_row and live_row.get("price") is not None and length == "shoulder":
        live_price = int(float(live_row["price"]))
        if live_price and live_price != price:
            conflict = True

    if conflict:
        q = _escalate_messages("live_vs_official")
        q.conflict = True
        q.needs_confirmation = True
        q.service_key = service_key
        q.service_id = int(live_row["id"]) if live_row and live_row.get("id") is not None else None
        q.service_name = live_row.get("name") if live_row else service_key
        q.length = length
        return q

    return PriceQuote(
        ok=True,
        service_key=service_key,
        service_id=int(live_row["id"]) if live_row and live_row.get("id") is not None else None,
        service_name=(live_row.get("name") if live_row else service_key.title()),
        amount_lkr=price,
        duration_minutes=mins,
        length=length,
        price_kind="guide",
        needs_confirmation=True,
        source="official_length_tiers",
        message_en=(
            f"Guide price for {service_key.title()} ({length.replace('_', ' ')}): "
            f"Rs {price:,} · ~{mins} min. Final price is confirmed at the salon visit."
        ),
        message_sg=(
            f"{service_key.title()} ({length.replace('_', ' ')}) guide price: "
            f"Rs {price:,} · ~{mins} min. Final price salon eke confirm wenawa."
        ),
        message_si=(
            f"{service_key.title()} ({length.replace('_', ' ')}) guide මිල: "
            f"Rs {price:,} · ~{mins} min. Final price salon එකේදී confirm වෙනවා."
        ),
    )


def _format_list(rows: list[dict[str, Any]], *, limit: int = 8) -> PriceQuote:
    lines_en = []
    cands = []
    for r in rows[:limit]:
        try:
            price = int(float(r.get("price") or 0))
        except (TypeError, ValueError):
            continue
        if price <= 0:
            continue
        mins = int(r.get("duration_minutes") or 0)
        name = str(r.get("name") or "").strip()
        if not name:
            continue
        lines_en.append(f"• {name}: Rs {price:,}" + (f" · {mins} min" if mins else ""))
        cands.append({
            "id": r.get("id"),
            "name": name,
            "price": price,
            "duration_minutes": mins,
            "category": r.get("category"),
        })
    if not lines_en:
        return _clarify_messages()
    body = "\n".join(lines_en)
    more = ""
    if len(rows) > limit:
        more = f"\n…and {len(rows) - limit} more — tell me the exact name for a precise quote."
    return PriceQuote(
        ok=True,
        price_kind="list",
        source="live_catalogue_list",
        candidates=cands,
        message_en=f"Verified salon prices:\n{body}{more}",
        message_sg=f"Verified salon prices:\n{body}{more}",
        message_si=f"Verified salon මිල:\n{body}{more}",
    )


def quote_fixed_row(row: dict[str, Any]) -> PriceQuote:
    try:
        price = int(float(row.get("price") or 0))
    except (TypeError, ValueError):
        return _escalate_messages("bad_price_value")
    if price <= 0:
        return _escalate_messages("missing_price")
    mins = int(row.get("duration_minutes") or 0)
    name = str(row.get("name") or "Service")
    return PriceQuote(
        ok=True,
        service_id=int(row["id"]) if row.get("id") is not None else None,
        service_name=name,
        amount_lkr=price,
        duration_minutes=mins or None,
        price_kind="fixed",
        source="live_catalogue",
        candidates=[{"id": row.get("id"), "name": name, "price": price, "duration_minutes": mins}],
        message_en=f"{name}: Rs {price:,}" + (f" · {mins} min." if mins else "."),
        message_sg=f"{name}: Rs {price:,}" + (f" · {mins} min." if mins else "."),
        message_si=f"{name}: Rs {price:,}" + (f" · {mins} min." if mins else "."),
    )


def quote_fixed_from_live(
    catalogue: list[dict[str, Any]],
    *,
    name_substr: str,
    expected_duration: Optional[int] = None,
    expected_price: Optional[int] = None,
) -> PriceQuote:
    rows = find_live_services(catalogue, name_substr=name_substr, active_only=True)
    if not rows:
        return _clarify_messages(name_substr)
    rows = sorted(rows, key=lambda r: len(str(r.get("name") or "")))
    if len(rows) > 1 and _norm_name(str(rows[0].get("name") or "")) != _norm_name(name_substr):
        # Multiple partial matches — list verified options instead of guessing one
        return _format_list(rows)
    row = rows[0]
    price = int(float(row.get("price") or 0))
    mins = int(row.get("duration_minutes") or 0)
    if expected_price is not None and price != expected_price:
        q = _escalate_messages("price_mismatch")
        q.conflict = True
        return q
    if expected_duration is not None and mins and mins != expected_duration:
        q = _escalate_messages("duration_mismatch")
        q.conflict = True
        return q
    return quote_fixed_row(row)


def _score_name_match(message_norm: str, service_norm: str) -> int:
    if not message_norm or not service_norm:
        return 0
    if service_norm == message_norm:
        return 100
    if service_norm in message_norm:
        return 80 + min(len(service_norm), 19)
    if message_norm in service_norm:
        return 60 + min(len(message_norm), 19)
    mtoks = set(message_norm.split())
    stoks = set(service_norm.split())
    # drop weak tokens
    weak = {"the", "a", "an", "and", "for", "with", "eka", "ekak", "price", "mila", "cost", "how", "much"}
    mtoks -= weak
    stoks -= weak
    if not mtoks or not stoks:
        return 0
    overlap = mtoks & stoks
    if not overlap:
        return 0
    return int(40 * len(overlap) / max(len(stoks), 1)) + len(overlap)


def match_services_by_name(message: str, catalogue: list[dict[str, Any]]) -> list[dict[str, Any]]:
    msg_n = _norm_name(message)
    scored: list[tuple[int, dict]] = []
    for r in _active(catalogue):
        sn = _norm_name(str(r.get("name") or ""))
        sc = _score_name_match(msg_n, sn)
        if sc >= 40:
            scored.append((sc, r))
    scored.sort(key=lambda x: (-x[0], len(str(x[1].get("name") or ""))))
    # dedupe by normalized name keeping best
    seen = set()
    out = []
    for sc, r in scored:
        k = _norm_name(str(r.get("name") or ""))
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out


def match_services_by_category(message: str, catalogue: list[dict[str, Any]]) -> tuple[Optional[str], list[dict[str, Any]]]:
    for label, ask_re, row_re in _CATEGORY_CUES:
        if ask_re.search(message or ""):
            rows = []
            for r in _active(catalogue):
                blob = f"{r.get('category') or ''} {r.get('name') or ''}"
                if row_re.search(blob):
                    rows.append(r)
            # Prefer category field match ordering
            rows.sort(key=lambda r: (0 if label[:4] in _norm_name(str(r.get("category") or "")) else 1, str(r.get("name") or "")))
            return label, rows
    return None, []


def detect_multi_price_targets(text: str) -> dict[str, Any]:
    """
    Detect independently answerable price/style/option asks in one message.
    Used to prevent hard-gate from answering only the first matched SKU.
    """
    t = text or ""
    butterfly = bool(re.search(r"\bbutterfly\b", t, re.I))
    layer = bool(re.search(r"\blayer(?:s|ed)?\b", t, re.I))
    duration = bool(
        re.search(
            r"\b(?:kochchara\s*wela|how\s*long|duration|wela\s*yan|minutes?|කොච්චර\s*වෙලා|වේලාව)\b",
            t,
            re.I,
        )
    )
    # True general haircut ask — NOT the product name "Ladies Hair Cut-Butterfly" alone
    general_haircut = bool(
        re.search(
            r"(?:"
            r"\b(?:mata|want|need|oni|ona)\b[^\n]{0,40}\b(?:hair\s*cut|haircut)\b|"
            r"\b(?:hair\s*cut|haircut)\s+(?:ekak|eka|options?|ekata|karaganna|kara\s*ganna)\b|"
            r"\bcut\s+ekak\b|\bcut\s+options?\b|"
            r"\bhair\s*cut\s+ekata\b"
            r")",
            t,
            re.I,
        )
    )
    normal_facial = bool(re.search(r"\bnormal\s*facial\b", t, re.I))
    hydra_facial = bool(re.search(r"\bhydra\s*facial\b|\bhydra\b", t, re.I))
    facial_options = bool(
        re.search(
            r"\bfacial\s+options?\b|\bfacials?\b.*\b(?:options?|list|tika|thiyen)|"
            r"\b(?:options?|tika)\b.*\bfacial",
            t,
            re.I,
        )
    ) or (
        bool(re.search(r"\bfacial", t, re.I))
        and bool(re.search(r"\b(?:options?|tika|list|thiyen|offer)\b", t, re.I))
    )

    bits = []
    if butterfly:
        bits.append("butterfly")
    if layer:
        bits.append("layer")
    if general_haircut and (butterfly or layer or duration):
        bits.append("haircut_general")
    if duration and (butterfly or layer or general_haircut):
        bits.append("duration")
    if normal_facial:
        bits.append("normal_facial")
    if hydra_facial:
        bits.append("hydra_facial")
    if facial_options:
        bits.append("facial_options")

    # Unique ordered targets for assembly
    targets = {
        "butterfly": butterfly,
        "layer": layer,
        "duration": duration,
        "general_haircut": general_haircut,
        "normal_facial": normal_facial,
        "hydra_facial": hydra_facial,
        "facial_options": facial_options,
        "parts": bits,
        "count": len(set(bits)),
    }
    return targets


def _fmt_row_line(row: dict[str, Any]) -> str:
    name = str(row.get("name") or "Service")
    try:
        price = int(float(row.get("price") or 0))
    except (TypeError, ValueError):
        price = 0
    mins = int(row.get("duration_minutes") or 0)
    if price <= 0:
        return f"{name}"
    return f"{name}: Rs {price:,}" + (f" · {mins} min" if mins else "")


def _layer_not_listed_lines() -> tuple[str, str, str]:
    en = (
        "Layer Cut: not listed as a separate active catalogue service — "
        "a stylist can confirm Layer Cut pricing/availability."
    )
    sg = (
        "Layer Cut: separate catalogue service ekak widiyata list wela naha — "
        "stylist kenekgen price/availability confirm karaganna puluwan."
    )
    si = (
        "Layer Cut: වෙනම active catalogue සේවාවක් විදිහට list වෙලා නැහැ — "
        "stylist කෙනෙක්ගෙන් මිල/availability confirm කරගන්න පුළුවන්."
    )
    return en, sg, si


def resolve_multi_price_ask(
    message: str,
    catalogue: list[dict[str, Any]],
) -> Optional[PriceQuote]:
    """
    When one message asks several price/style questions, assemble ONE complete
    verified reply. Returns None to fall through to single-SKU resolve_price.
    Never invents services or amounts.
    """
    targets = detect_multi_price_targets(message)
    # Need 2+ independent parts (e.g. Butterfly+Layer, Normal+Hydra, options+prices)
    if targets["count"] < 2:
        return None

    lines_en: list[str] = []
    lines_sg: list[str] = []
    lines_si: list[str] = []
    candidates: list[dict[str, Any]] = []
    answered: list[str] = []

    # --- Hair cut family ---
    if targets["butterfly"]:
        lives = find_live_services(catalogue, name_substr="butterfly", active_only=True)
        butterfly = next(
            (
                r
                for r in lives
                if "butterfly" in _norm_name(str(r.get("name") or ""))
                and "hair cut" in _norm_name(str(r.get("name") or ""))
            ),
            lives[0] if lives else None,
        )
        if butterfly:
            line = _fmt_row_line(butterfly)
            lines_en.append(f"• {line}")
            lines_sg.append(f"• {line}")
            lines_si.append(f"• {line}")
            candidates.append(
                {
                    "id": butterfly.get("id"),
                    "name": butterfly.get("name"),
                    "price": butterfly.get("price"),
                    "duration_minutes": butterfly.get("duration_minutes"),
                }
            )
            answered.append("butterfly")
        else:
            lines_en.append("• Butterfly Cut: not found on the verified live list — stylist can confirm.")
            lines_sg.append("• Butterfly Cut: verified list eken hambune naha — stylist kenekgen confirm karaganna.")
            lines_si.append("• Butterfly Cut: verified list එකේ නැහැ — stylist කෙනෙක්ගෙන් confirm කරන්න.")
            answered.append("butterfly_missing")

    if targets["layer"]:
        lives = find_live_services(catalogue, name_substr="layer", active_only=True)
        if lives:
            line = _fmt_row_line(lives[0])
            lines_en.append(f"• {line}")
            lines_sg.append(f"• {line}")
            lines_si.append(f"• {line}")
            candidates.append(
                {
                    "id": lives[0].get("id"),
                    "name": lives[0].get("name"),
                    "price": lives[0].get("price"),
                    "duration_minutes": lives[0].get("duration_minutes"),
                }
            )
        else:
            en, sg, si = _layer_not_listed_lines()
            lines_en.append(f"• {en}")
            lines_sg.append(f"• {sg}")
            lines_si.append(f"• {si}")
        answered.append("layer")

    if targets["general_haircut"] or targets["duration"]:
        # Verified base cuts for general haircut / duration asks (never invent)
        for substr in ("ladies hair cut", "gents hair cut"):
            rows = find_live_services(catalogue, name_substr=substr, active_only=True)
            # Prefer exact base name (not Butterfly)
            exact = [
                r
                for r in rows
                if _norm_name(str(r.get("name") or "")) == substr
            ]
            row = exact[0] if exact else None
            if not row:
                continue
            # Skip if already listed via butterfly path with same id
            if any(c.get("id") == row.get("id") for c in candidates):
                continue
            line = _fmt_row_line(row)
            # If duration asked, emphasize minutes
            if targets["duration"] and int(row.get("duration_minutes") or 0):
                line = (
                    f"{row.get('name')}: Rs {int(float(row.get('price') or 0)):,} · "
                    f"{int(row.get('duration_minutes'))} min"
                )
            lines_en.append(f"• {line}")
            lines_sg.append(f"• {line}")
            lines_si.append(f"• {line}")
            candidates.append(
                {
                    "id": row.get("id"),
                    "name": row.get("name"),
                    "price": row.get("price"),
                    "duration_minutes": row.get("duration_minutes"),
                }
            )
        answered.append("haircut_general")

    # --- Facial family ---
    facial_rows = [
        s
        for s in _active(catalogue)
        if "facial" in _norm_name(f"{s.get('category') or ''} {s.get('name') or ''}")
        or "clean up" in _norm_name(str(s.get("name") or ""))
        or "cleanup" in _norm_name(str(s.get("name") or ""))
    ]

    def _add_facial_rows(rows: list[dict[str, Any]], label: str) -> None:
        nonlocal answered
        if not rows:
            lines_en.append(f"• {label}: no verified live rows found — team can confirm.")
            lines_sg.append(f"• {label}: verified live rows naha — team eken confirm karaganna.")
            lines_si.append(f"• {label}: verified live rows නැහැ — team එකෙන් confirm කරන්න.")
            return
        for r in rows:
            if any(c.get("id") == r.get("id") for c in candidates):
                continue
            line = _fmt_row_line(r)
            lines_en.append(f"• {line}")
            lines_sg.append(f"• {line}")
            lines_si.append(f"• {line}")
            candidates.append(
                {
                    "id": r.get("id"),
                    "name": r.get("name"),
                    "price": r.get("price"),
                    "duration_minutes": r.get("duration_minutes"),
                    "category": r.get("category"),
                }
            )

    if targets["normal_facial"]:
        normals = [
            r
            for r in facial_rows
            if "normal facial" in _norm_name(str(r.get("name") or ""))
        ]
        _add_facial_rows(normals, "Normal Facial")
        answered.append("normal_facial")

    if targets["hydra_facial"]:
        hydras = [
            r
            for r in facial_rows
            if "hydra" in _norm_name(str(r.get("name") or ""))
        ]
        # Distinct IDs — do not merge aliases
        _add_facial_rows(hydras, "Hydra Facial")
        answered.append("hydra_facial")

    if targets["facial_options"] and not (targets["normal_facial"] or targets["hydra_facial"]):
        # Broad facial options ask — list verified facial rows (cap)
        show = facial_rows[:12]
        _add_facial_rows(show, "Facial options")
        answered.append("facial_options")
    elif targets["facial_options"] and (targets["normal_facial"] or targets["hydra_facial"]):
        # Options asked alongside named types — already covered named; add a short note
        if "facial_options" not in answered:
            answered.append("facial_options")

    if len(answered) < 2 or not (lines_en or lines_sg or lines_si):
        return None

    header_en = "Here are the verified answers for each part of your question:"
    header_sg = "Oyage question eke each part walata verified answers:"
    header_si = "ඔබේ ප්‍රශ්නයේ එක එක කොටසට verified answers:"

    body_en = "\n".join(lines_en)
    body_sg = "\n".join(lines_sg)
    body_si = "\n".join(lines_si)

    return PriceQuote(
        ok=True,
        price_kind="list",
        source="multi_price_ask",
        needs_clarification=("layer" in answered and not any(
            c.get("name") and "layer" in _norm_name(str(c.get("name"))) for c in candidates
        )),
        candidates=candidates,
        amount_lkr=None,  # multi — do not force single-amount self-repair
        message_en=f"{header_en}\n{body_en}",
        message_sg=f"{header_sg}\n{body_sg}",
        message_si=f"{header_si}\n{body_si}",
    )


def resolve_price(
    message: str,
    catalogue: list[dict[str, Any]],
    *,
    length: Optional[str] = None,
    prior_service_key: Optional[str] = None,
    memory: Optional[dict[str, Any]] = None,
) -> PriceQuote:
    """
    Always returns a safe quote for price handling:
    ok quote | needs_length | needs_clarification | escalate.
    Never invents amounts outside catalogue / official tiers.

    `prior_service_key` / `memory`: structured context for length-only follow-ups
    (e.g. customer said only "Bra Strap" after a Keratin length ask).
    """
    text = message or ""
    length = length or detect_length(text)
    mem_key = prior_service_key or resolve_service_key_from_memory(memory)

    # 0-multi) Several questions / styles in one message — answer ALL verified parts
    multi = resolve_multi_price_ask(text, catalogue)
    if multi is not None:
        return multi

    # 0) Well-known fixed cuts with official expected values (before fuzzy name match)
    # Only for bare ladies/gents cut asks — never override a more specific SKU
    # (e.g. "Ladies Hair Cut-Butterfly" must not collapse to plain Ladies Hair Cut).
    # Butterfly / Layer must resolve before the generic Ladies Hair Cut fixed path.
    if re.search(r"\bbutterfly\b", text, re.I):
        lives = find_live_services(catalogue, name_substr="butterfly", active_only=True)
        butterfly = None
        for r in lives:
            n = _norm_name(str(r.get("name") or ""))
            if "butterfly" in n and "hair cut" in n:
                butterfly = r
                break
        if not butterfly and lives:
            butterfly = lives[0]
        if butterfly:
            return quote_fixed_row(butterfly)
        return _clarify_messages(
            "Butterfly Cut — not found on the verified live list; a stylist can confirm"
        )
    if re.search(r"\blayer(?:s|ed)?\b", text, re.I):
        lives = find_live_services(catalogue, name_substr="layer", active_only=True)
        if lives:
            return quote_fixed_row(lives[0])
        en, sg, si = _layer_not_listed_lines()
        return PriceQuote(
            ok=False,
            needs_clarification=True,
            escalate=False,
            source="clarify_style_not_listed",
            message_en=en,
            message_sg=sg,
            message_si=si,
        )
    if re.search(r"lad(?:y|ies).{0,12}hair\s*cut|hair\s*cut.{0,12}lad", text, re.I):
        extra = _distinctive_tokens(text) - {"ladies", "lady", "hair", "cut", "haircut"}
        # Distinctive style tokens must never collapse to plain Ladies Hair Cut
        if extra & {"butterfly", "layer", "layers", "layered", "bob", "pixie", "undercut", "fade"}:
            pass  # fall through to name match / clarify
        elif not extra:
            return quote_fixed_from_live(
                catalogue, name_substr="ladies hair cut", expected_duration=45, expected_price=3500
            )
    if re.search(r"gents?.{0,12}hair\s*cut|hair\s*cut.{0,12}gents?", text, re.I):
        extra = _distinctive_tokens(text) - {"gents", "gent", "men", "man", "hair", "cut", "haircut"}
        if not extra:
            return quote_fixed_from_live(
                catalogue, name_substr="gents hair cut", expected_duration=45, expected_price=2000
            )

    # 0b) Length-only follow-up with structured prior service (never Gemini-history alone)
    if is_length_only_message(text):
        if length and mem_key and mem_key in OFFICIAL_LENGTH_TIERS:
            live = None
            lives = find_live_services(catalogue, name_substr=mem_key.replace("_", " "), active_only=True)
            if lives:
                key_norm = _norm_name(mem_key.replace("_", " "))

                def score(r: dict) -> tuple:
                    n = _norm_name(str(r.get("name") or ""))
                    exact = 0 if n == key_norm else 1
                    starts = 0 if n.startswith(key_norm) else 1
                    return (exact, starts, len(n))

                live = sorted(lives, key=score)[0]
                live_norm = _norm_name(str(live.get("name") or ""))
                if not live_norm.startswith(key_norm) and live_norm != key_norm:
                    if key_norm not in live_norm.split() or "front area" in live_norm:
                        live = None
            return quote_length_tier(mem_key, length, live_row=live)
        return _clarify_messages(
            "which service — Keratin, Botox, Rebonding, Highlights…"
        )

    # 1) Length-tier official services (Keratin/Botox/…) — always ask length / use official tiers
    key = detect_length_service_key(text)
    if key:
        # More specific SKU names that merely contain the keyword (e.g. Front Area Relax Rebonding)
        # must not be forced into the full-head length-tier flow.
        key_norm = _norm_name(key.replace("_", " "))
        for r in match_services_by_name(text, catalogue):
            sn = _norm_name(str(r.get("name") or ""))
            if sn != key_norm and key_norm in sn and _score_name_match(_norm_name(text), sn) >= 70:
                return quote_fixed_row(r)

        live = None
        lives = find_live_services(catalogue, name_substr=key.replace("_", " "), active_only=True)
        if lives:
            key_norm = _norm_name(key.replace("_", " "))

            def score(r: dict) -> tuple:
                n = _norm_name(str(r.get("name") or ""))
                exact = 0 if n == key_norm else 1
                starts = 0 if n.startswith(key_norm) else 1
                return (exact, starts, len(n))

            live = sorted(lives, key=score)[0]
            live_norm = _norm_name(str(live.get("name") or ""))
            if not live_norm.startswith(key_norm) and live_norm != key_norm:
                if key_norm not in live_norm.split():
                    live = None
                elif "front area" in live_norm:
                    live = None
        return quote_length_tier(key, length, live_row=live)

    # 2) Strong catalogue name match (e.g. Front Area Relax Rebonding)
    early_named = match_services_by_name(text, catalogue)
    msg_n = _norm_name(text)
    strong_early = [
        r for r in early_named
        if _score_name_match(msg_n, _norm_name(str(r.get("name") or ""))) >= 70
    ]
    if len(strong_early) == 1:
        # If the matched row itself is a length-tier SKU name (Keratin), still use length flow
        row_key = detect_length_service_key(str(strong_early[0].get("name") or ""))
        if row_key and row_key in OFFICIAL_LENGTH_TIERS:
            return quote_length_tier(row_key, length, live_row=strong_early[0])
        return quote_fixed_row(strong_early[0])

    # 3) Direct name match against live catalogue
    named = match_services_by_name(text, catalogue)
    if len(named) == 1:
        return quote_fixed_row(named[0])
    if len(named) > 1:
        msg_n = _norm_name(text)
        # Prefer the longest catalogue name fully contained in the ask
        # (Ladies Hair Cut-Butterfly beats plain Ladies Hair Cut).
        contained = [
            r for r in named
            if (n := _norm_name(str(r.get("name") or ""))) and n in msg_n
        ]
        if contained:
            contained.sort(key=lambda r: (-len(_norm_name(str(r.get("name") or ""))), str(r.get("name") or "")))
            best = contained[0]
            best_n = _norm_name(str(best.get("name") or ""))
            second_n = _norm_name(str(contained[1].get("name") or "")) if len(contained) > 1 else ""
            if not second_n or len(best_n) > len(second_n):
                row_key = detect_length_service_key(str(best.get("name") or ""))
                if row_key and row_key in OFFICIAL_LENGTH_TIERS:
                    return quote_length_tier(row_key, length, live_row=best)
                return quote_fixed_row(best)
        # If one score clearly dominates via exact containment, prefer it
        top = named[0]
        top_n = _norm_name(str(top.get("name") or ""))
        if top_n in msg_n or msg_n in top_n:
            strong = [r for r in named if _score_name_match(msg_n, _norm_name(str(r.get("name") or ""))) >= 70]
            if len(strong) == 1:
                return quote_fixed_row(strong[0])
        return _format_list(named)

    # 4) Category ask → verified LIST only (never auto-pick a single SKU as "the" price)
    # Unknown named services that merely contain a category word (e.g. "galaxy plasma treatment")
    # must clarify — never map to Keratin / sole category row.
    cat_label, cat_rows = match_services_by_category(text, catalogue)
    if cat_label and cat_rows:
        if is_generic_category_price_ask(text, cat_label):
            return _format_list(cat_rows)
        # Distinctive unknown name + category cue → no verified identity
        return PriceQuote(
            ok=False,
            needs_clarification=True,
            escalate=False,
            source="clarify_unknown_named_service",
            message_en=(
                "I couldn't find that exact service on our verified salon list. "
                "Please share the catalogue name (or say *staff* and a team member will help)."
            ),
            message_sg=(
                "Eka exact service eka verified list eken hambune na. "
                "Catalogue name eka kiyanna — nathnam *staff* kiyala team eken confirm karaganna."
            ),
            message_si=(
                "ඒ නිශ්චිත සේවාව verified list එකේ නැහැ. "
                "Catalogue නම කියන්න — නැත්නම් *staff* කියලා කාර්ය මණ්ඩලයෙන් උදව් ගන්න."
            ),
        )

    # 5) Price ask but nothing verified → clarify (never invent)
    if is_price_enquiry(text):
        return _clarify_messages()

    return _clarify_messages()


def pick_quote_message(quote: PriceQuote, script_mode: str) -> str:
    mode = (script_mode or "").lower()
    if mode == "singlish":
        return quote.message_sg or quote.message_en
    if mode == "sinhala":
        return quote.message_si or quote.message_sg or quote.message_en
    return quote.message_en or quote.message_sg
