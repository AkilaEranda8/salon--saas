"""
WhatsApp AI CRM booking dialogue — separate from legacy ai_bot.
Deterministic state machine + salon tool calls: book, cancel (with confirm), reschedule.

Session state lives in Redis (see session_store). Key layout:
    ai:booking:session:{tenant_id}:{conversation_id or 0}:{phone}
Use `clear_session(tenant_id, phone)` (re-exported below) to drop it, e.g. when a human claims the chat.
"""
from __future__ import annotations

import re
from contextvars import ContextVar
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from typing import Any, Optional

from app.session_store import (
    BookingSessionUnavailable,
    clear_session,  # noqa: F401  (re-exported: human-claim hook)
    delete_session,
    load_session_raw,
    save_session_raw,
)
from app.tools import run_tool
from app.conversation_truth import (
    ConversationTruth,
    bump_turn,
    format_truth_for_prompt,
    is_explicit_service_change,
    is_memory_recall_ask,
    parse_relative_date,
    set_field,
    short_numeric_intent,
    today_colombo,
    validate_booking_preflight,
)

IDLE = "idle"
AWAIT_SERVICE = "await_service"
AWAIT_STAFF = "await_staff"
AWAIT_DATE = "await_date"
AWAIT_TIME = "await_time"
AWAIT_NAME = "await_name"
AWAIT_CONFIRM = "await_confirm"
AWAIT_CANCEL_PICK = "await_cancel_pick"
AWAIT_CANCEL_CONFIRM = "await_cancel_confirm"
AWAIT_RESCHED_PICK = "await_resched_pick"
AWAIT_RESCHED_DATE = "await_resched_date"
AWAIT_RESCHED_TIME = "await_resched_time"
AWAIT_RESCHED_CONFIRM = "await_resched_confirm"

CANCEL_STATES = frozenset({AWAIT_CANCEL_PICK, AWAIT_CANCEL_CONFIRM})
RESCHED_STATES = frozenset(
    {AWAIT_RESCHED_PICK, AWAIT_RESCHED_DATE, AWAIT_RESCHED_TIME, AWAIT_RESCHED_CONFIRM}
)

CONFIRM_TOKENS = frozenset(
    {
        "yes", "y", "ok", "okay", "confirm", "book",
        "ඔව්", "ඔව්යි", "ඔවු", "හරි", "ஆம்", "ஆமாம்", "சரி",
    }
)
DECLINE_TOKENS = frozenset(
    {"no", "nope", "cancel", "නැහැ", "නෑ", "එපා", "இல்லை", "வேண்டாம்"}
)


# ── Language (Sinhala / Tamil / English) ─────────────────────────────────────

def _script_counts(text: str) -> tuple[int, int, int]:
    si = ta = latin = 0
    for ch in text or "":
        o = ord(ch)
        if 0x0D80 <= o <= 0x0DFF:
            si += 1
        elif 0x0B80 <= o <= 0x0BFF:
            ta += 1
        elif ch.isalpha() and o < 0x250:
            latin += 1
    return si, ta, latin


# Latin Singlish / spoken-Sinhala cues (customer types Sinhala in English letters)
_SINGLISH_RE = re.compile(
    r"\b(?:"
    r"mata|mta|oyata|oba|umbata|api|eya|oyaa|oyage|"
    r"oni|ona|onai|kamak|kamakda|kohomada|mokakda|mokadda|monawada|monada|monda|mond|"
    r"puluwan|puluwanda|puluwa|barnawa|karanna|karaganna|kara\s*ganna|ganna|gnn|"
    r"therenne|therum|dannawa|danne|kiyanawa|kiyanna|kiyanawada|thiyenne|thiyenwad|"
    r"ayubowan|bohoma|istuti|sthuthi|hari|naha|nae|nehe|ne\b|da\b|"
    r"ekak|eka|okkom|okoma|aade|ade|ada|heta|hete|hetta|ida|anidda|"
    r"wedak|weda|salon|style|cut\s*ekak|keeyak|kiyada|mila|gana|ganada|"
    # Misspellings only — plain English "appointment"/"booking" must NOT force Singlish
    r"appoinment|appoimnet|appoitment|"
    r"karaganna|penna|wenna|wenne|katha|kranna|kranapmn"
    r")\b",
    re.I,
)


def detect_lang(text: str) -> Optional[str]:
    """'si' / 'ta' / 'en'. Sinhala script OR clear Singlish → si."""
    si, ta, latin = _script_counts(text)
    total = si + ta + latin
    if total == 0:
        return None
    if si / total >= 0.25:
        return "si"
    if ta / total >= 0.25:
        return "ta"
    # Singlish in Latin letters still means customer expects Sinhala-flavoured replies
    if _SINGLISH_RE.search(text or ""):
        return "si"
    return "en"


def detect_script_mode(text: str) -> str:
    """
    How the customer is actually typing — drives realistic reply style.
    Returns: singlish | sinhala | tamil | english
    """
    raw = text or ""
    si, ta, latin = _script_counts(raw)
    total = max(si + ta + latin, 1)
    if si / total >= 0.25:
        return "sinhala"
    if ta / total >= 0.25:
        return "tamil"
    if _SINGLISH_RE.search(raw):
        return "singlish"
    # Short Latin with salon chat vibe still often Singlish (e.g. "hari", "oka")
    if re.search(r"\b(?:hari|oka|okaa|hm+|hmm+|ooh|aah)\b", raw, re.I) and latin >= 1:
        return "singlish"
    return "english"


def update_lang(current: str, text: str) -> str:
    """Switch to si/ta immediately; back to English only on a real English message
    (so a lone 'yes'/'ok' from a Sinhala/Tamil customer doesn't flip the language)."""
    detected = detect_lang(text)
    if detected in ("si", "ta"):
        return detected
    if detected == "en":
        if current == "en":
            return "en"
        # Don't flip off Sinhala for short English replies (yes/no/ok/1/2)
        words = [w for w in re.findall(r"[A-Za-z]+", text or "") if len(w) > 1]
        if len(words) >= 4 and not _SINGLISH_RE.search(text or ""):
            return "en"
    return current if current in ("en", "si", "ta") else "en"


def update_script_mode(current: Optional[str], text: str) -> str:
    """Sticky script mode — Singlish customers stay Singlish unless they switch to සිංහල script."""
    detected = detect_script_mode(text)
    cur = (current or "").strip() or "english"
    if detected == "sinhala":
        return "sinhala"
    if detected == "tamil":
        return "tamil"
    if detected == "singlish":
        return "singlish"
    # Short Latin (yes/ok/1/2) must NOT flip off Singlish/Sinhala
    words = [w for w in re.findall(r"[A-Za-z]+", text or "") if len(w) > 1]
    if cur in ("singlish", "sinhala", "tamil"):
        if detected == "english" and len(words) >= 5 and cur == "singlish":
            return "english"  # clear English sentence → leave Singlish
        return cur  # keep sticky mode
    return detected if detected else cur


def lang_label(lang: str, script_mode: Optional[str] = None) -> str:
    mode = (script_mode or "").strip().lower()
    if mode == "singlish":
        return "Singlish (Latin Sinhala mix — like WhatsApp: hari, heta, oni, mila). Do NOT use formal Sinhala Unicode."
    if mode == "sinhala":
        return "Sinhala script (සිංහල) — natural WhatsApp Sinhala, not overly formal"
    if mode == "tamil" or lang == "ta":
        return "Tamil (தமிழ்) — short WhatsApp style; if weak Tamil, say briefly and continue in English/Singlish"
    return {"si": "Sinhala / Singlish (match how they type)", "ta": "Tamil (தமிழ்)", "en": "English"}.get(
        lang or "en", "English"
    )


_T: dict[str, dict[str, str]] = {
    # labels
    "lbl_service": {"en": "Service", "si": "සේවාව", "ta": "சேவை"},
    "lbl_staff": {"en": "Staff", "si": "ස්ටයිලිස්ට්", "ta": "ஸ்டைலிஸ்ட்"},
    "lbl_when": {"en": "When", "si": "වේලාව", "ta": "நேரம்"},
    "lbl_duration": {"en": "Duration", "si": "කාලය", "ta": "நேரம்"},
    "lbl_name": {"en": "Name", "si": "නම", "ta": "பெயர்"},
    "lbl_from": {"en": "From", "si": "දැනට", "ta": "தற்போது"},
    "lbl_to": {"en": "To", "si": "අලුත්", "ta": "புதியது"},
    "lbl_appt": {"en": "Appointment", "si": "වෙන්කිරීම", "ta": "முன்பதிவு"},
    "please_confirm": {"en": "Please confirm:", "si": "කරුණාකර තහවුරු කරන්න:", "ta": "தயவுசெய்து உறுதிப்படுத்தவும்:"},
    "please_confirm_resched": {
        "en": "Please confirm the reschedule:",
        "si": "නැවත වේලාව වෙනස් කිරීම තහවුරු කරන්න:",
        "ta": "மறுநேர மாற்றத்தை உறுதிப்படுத்தவும்:",
    },
    # generic
    "yes_no": {
        "en": "Reply *yes* to confirm or *no* to cancel.",
        "si": "තහවුරු කිරීමට *yes* (ඔව්) හෝ අවලංගු කිරීමට *no* (නැහැ) යවන්න.",
        "ta": "உறுதிப்படுத்த *yes* (ஆம்), ரத்து செய்ய *no* (இல்லை) என அனுப்புங்கள்.",
        "sg": "Confirm karanna *yes*, nathnam cancel karanna *no* kiyanna.",
    },
    "yes_no_redo": {
        "en": "Please reply *yes* to confirm or *no* to cancel.",
        "si": "කරුණාකර තහවුරු කිරීමට *yes* හෝ අවලංගු කිරීමට *no* යවන්න.",
        "ta": "உறுதிப்படுத்த *yes* அல்லது ரத்து செய்ய *no* என அனுப்புங்கள்.",
        "sg": "Hari — *yes* kiyala confirm karanna, nathnam *no*.",
    },
    "abort": {
        "en": "No problem — stopped. How else can I help?",
        "si": "කමක් නැහැ — නතර කළා. තවත් කුමක් උදව් කරන්නද?",
        "ta": "சரி — நிறுத்திவிட்டேன். வேறு எப்படி உதவலாம்?",
        "sg": "Hari — stop kala. Thawa mokadda help karanna?",
    },
    "session_down_1": {
        "en": "Booking is temporarily unavailable while we reconnect our session store. Please try again in a moment, or ask a staff member to help.",
        "si": "සැසි ගබඩාව නැවත සම්බන්ධ කරන නිසා වෙන්කිරීම තාවකාලිකව නැත. මොහොතකින් නැවත උත්සාහ කරන්න, නැතහොත් කාර්ය මණ්ඩලයෙන් අසන්න.",
        "ta": "அமர்வு சேமிப்பகம் மீண்டும் இணைக்கப்படுவதால் முன்பதிவு தற்காலிகமாக கிடைக்கவில்லை. சிறிது நேரத்தில் மீண்டும் முயற்சிக்கவும், அல்லது ஊழியரிடம் கேளுங்கள்.",
    },
    "session_down_2": {
        "en": "Booking is temporarily unavailable while we reconnect our session store. Please try again in a moment.",
        "si": "වෙන්කිරීම තාවකාලිකව නැත. මොහොතකින් නැවත උත්සාහ කරන්න.",
        "ta": "முன்பதிவு தற்காலிகமாக கிடைக்கவில்லை. சிறிது நேரத்தில் மீண்டும் முயற்சிக்கவும்.",
    },
    "need_phone": {
        "en": "I need your phone number on this chat to find appointments.",
        "si": "වෙන්කිරීම් සොයාගැනීමට මේ චැට් එකේ ඔබේ දුරකථන අංකය අවශ්‍යයි.",
        "ta": "முன்பதிவுகளைக் கண்டறிய இந்த அரட்டையில் உங்கள் தொலைபேசி எண் தேவை.",
        "sg": "Appointments find karanna WhatsApp number eka one — me chat eken message karanna.",
    },
    # booking
    "svc_prompt": {
        "en": "Great! Which service would you like?\n{listing}\n\nReply with the number or name.",
        "si": "හරි! ඔබට අවශ්‍ය සේවාව කුමක්ද?\n{listing}\n\nඅංකය හෝ නම එවන්න.",
        "ta": "சரி! எந்த சேவை வேண்டும்?\n{listing}\n\nஎண் அல்லது பெயரை அனுப்புங்கள்.",
    },
    "svc_pick": {
        "en": "Please choose a service from the list:\n{listing}",
        "si": "කරුණාකර ලැයිස්තුවෙන් සේවාවක් තෝරන්න:\n{listing}",
        "ta": "பட்டியலில் இருந்து ஒரு சேவையைத் தேர்ந்தெடுக்கவும்:\n{listing}",
    },
    "svc_filtered": {
        "en": "Here are matching services:\n{listing}\n\nReply with the *number* or full name.",
        "si": "ඔබට ගැලපෙන සේවා:\n{listing}\n\n*අංකය* හෝ සම්පූර්ණ නම එවන්න.",
        "ta": "பொருந்தும் சேவைகள்:\n{listing}\n\n*எண்* அல்லது முழுப் பெயரை அனுப்புங்கள்.",
    },
    "no_services": {
        "en": "Sorry — no bookable services are listed for {brand} right now.",
        "si": "සමාවෙන්න — {brand} හි වෙන්කළ හැකි සේවා දැනට නැත.",
        "ta": "மன்னிக்கவும் — {brand} இல் தற்போது முன்பதிவு செய்யக்கூடிய சேவைகள் இல்லை.",
    },
    "staff_prompt": {
        "en": "Who would you like for *{service}*?\n{listing}\n\nReply with number or name.",
        "si": "*{service}* සඳහා ඔබට කවුරුන්ද ඕන?\n{listing}\n\nඅංකය හෝ නම එවන්න.",
        "ta": "*{service}* க்கு யார் வேண்டும்?\n{listing}\n\nஎண் அல்லது பெயரை அனுப்புங்கள்.",
    },
    "staff_pick": {
        "en": "Please pick a stylist:\n{listing}",
        "si": "කරුණාකර ස්ටයිලිස්ට් කෙනෙකු තෝරන්න:\n{listing}",
        "ta": "ஒரு ஸ்டைலிஸ்ட்டைத் தேர்ந்தெடுக்கவும்:\n{listing}",
    },
    "no_staff": {
        "en": "No staff available for {service}. Please try another service.",
        "si": "{service} සඳහා කිසිවෙකු නැත. වෙනත් සේවාවක් උත්සාහ කරන්න.",
        "ta": "{service} க்கு யாரும் இல்லை. வேறு சேவையை முயற்சிக்கவும்.",
    },
    "ask_date": {
        "en": "What date? (today / tomorrow / heta / Monday) — or say *heta 10am* together.",
        "si": "කුමන දිනයටද? (අද / හෙට / heta / සඳුදා) — *heta 10am* වගේ එකටම කියන්නත් පුළුවන්.",
        "ta": "எந்த தேதி? (இன்று / நாளை / heta) — *heta 10am* போல ஒன்றாகவும் சொல்லலாம்.",
        "sg": "Ow — date eka kiyanna (*ade* / *heta* / Monday). *Heta 10am* wage ekama message ekenath puluwan!",
    },
    "bad_date": {
        "en": "Please send a date like *today*, *tomorrow*, *heta*, *Saturday*, or *2026-11-14*. You can also say *heta 10 am*.",
        "si": "කරුණාකර *අද*, *හෙට*, *heta*, *සෙනසුරාදා*, හෝ *2026-11-14* වගේ දිනයක් එවන්න. *heta 10 am* වගේ එකටමත් කියන්න පුළුවන්.",
        "ta": "*இன்று*, *நாளை*, *heta*, *சனி*, அல்லது *2026-11-14* போன்ற தேதியை அனுப்புங்கள். *heta 10 am* என்றும் சொல்லலாம்.",
        "sg": "Date eka clear karanna — *ade*, *heta*, *Saturday*, or *2026-11-14*. *Heta 10 am* wage kiyannath puluwan.",
    },
    "no_slots": {
        "en": "No open slots on {date}. Try another date?",
        "si": "{date} දින හිස් වේලාවන් නැත. වෙනත් දිනයක් උත්සාහ කරමුද?",
        "ta": "{date} அன்று காலி நேரம் இல்லை. வேறு தேதி முயற்சிக்கலாமா?",
        "sg": "{date} ta slots naha. Wena date ekak try karamu da?",
    },
    "times": {
        "en": "{duration_line}Available on {date}:\n{shown}{more}\n\n{example_line}Reply with a start time (e.g. *10:00*), or *morning* / *afternoon* / *evening*.",
        "si": "{duration_line}{date} දින start වේලාවන්:\n{shown}{more}\n\n{example_line}Start වේලාවක් එවන්න (උදා: *10:00*), නැත්නම් *morning* / *afternoon* / *evening*.",
        "ta": "{duration_line}{date} தொடக்க நேரங்கள்:\n{shown}{more}\n\n{example_line}தொடக்க நேரம் அனுப்புங்கள் (எ.கா. *10:00*), அல்லது *morning* / *afternoon* / *evening*.",
        "sg": "{duration_line}{date} ta thiyena start times:\n{shown}{more}\n\n{example_line}Oyata match wena time ekak kiyanna (e.g. *10:00*) — nathnam *morning* / *afternoon* / *evening*.",
    },
    "times_period": {
        "en": "{duration_line}*{period}* start times on {date}:\n{shown}{more}\n\n{example_line}Pick a start time (e.g. *12:00*).",
        "si": "{duration_line}{date} *{period}* start වේලා:\n{shown}{more}\n\n{example_line}Start වේලාවක් තෝරන්න (උදා: *12:00*).",
        "ta": "{duration_line}{date} *{period}* தொடக்க நேரங்கள்:\n{shown}{more}\n\n{example_line}தொடக்க நேரம் தேர்வு (எ.கா. *12:00*).",
        "sg": "{duration_line}Hari — {date} *{period}* start times:\n{shown}{more}\n\n{example_line}Oyata honda eka pick karanna (e.g. *12:00*).",
    },
    "bad_time": {
        "en": "Send a time like *10:00* or *2pm*. Options: {options}",
        "si": "*10:00* හෝ *2pm* වැනි වේලාවක් එවන්න. විකල්ප: {options}",
        "ta": "*10:00* அல்லது *2pm* போன்ற நேரத்தை அனுப்புங்கள். விருப்பங்கள்: {options}",
        "sg": "Time ekak kiyanna — *10:00* or *2pm*. Options: {options}",
    },
    "slot_taken": {
        "en": "That slot isn’t free. Try: {options}",
        "si": "ඒ වේලාව නිදහස් නැත. මේවා උත්සාහ කරන්න: {options}",
        "ta": "அந்த நேரம் காலியாக இல்லை. இவற்றை முயற்சிக்கவும்: {options}",
        "sg": "Eka slot eka free naha. Meva try karanna: {options}",
    },
    "ask_name": {
        "en": "What name should we put on the booking?",
        "si": "වෙන්කිරීමට දාන්නේ කුමන නමද?",
        "ta": "முன்பதிவில் எந்த பெயரை சேர்க்க வேண்டும்?",
        "sg": "Booking eke name eka mokadda danna?",
    },
    "ask_name_short": {
        "en": "Please send your name.",
        "si": "කරුණාකර ඔබේ නම එවන්න.",
        "ta": "உங்கள் பெயரை அனுப்புங்கள்.",
        "sg": "Name eka kiyanna.",
    },
    "draft_cancelled": {
        "en": "Okay, I cancelled that booking draft. Say *book* anytime to start again.",
        "si": "හරි, එම වෙන්කිරීමේ කෙටුම්පත අවලංගු කළා. නැවත ආරම්භ කිරීමට *book* යවන්න.",
        "ta": "சரி, அந்த முன்பதிவு வரைவை ரத்து செய்தேன். மீண்டும் தொடங்க *book* என அனுப்புங்கள்.",
        "sg": "Hari — draft eka cancel kala. Aye start karanna *book* kiyanna.",
    },
    "no_phone": {
        "en": "I need your WhatsApp number to finish the booking. Please message us again from your phone.",
        "si": "වෙන්කිරීම අවසන් කිරීමට ඔබේ WhatsApp අංකය අවශ්‍යයි. කරුණාකර ඔබේ දුරකථනයෙන් නැවත පණිවිඩයක් එවන්න.",
        "ta": "முன்பதிவை முடிக்க உங்கள் WhatsApp எண் தேவை. தயவுசெய்து உங்கள் தொலைபேசியிலிருந்து மீண்டும் செய்தி அனுப்புங்கள்.",
    },
    "book_fail": {
        "en": "I couldn’t complete the booking just now ({err}). I’m retrying in the background — or pick another time / ask staff.",
        "si": "දැන් වෙන්කිරීම සම්පූර්ණ කළ නොහැකි විය ({err}). පසුබිමින් නැවත උත්සාහ කරමින් සිටිමි — නැතහොත් වෙනත් වේලාවක් තෝරන්න / කාර්ය මණ්ඩලයෙන් අසන්න.",
        "ta": "இப்போது முன்பதிவை முடிக்க முடியவில்லை ({err}). பின்னணியில் மீண்டும் முயற்சிக்கிறேன் — அல்லது வேறு நேரத்தைத் தேர்ந்தெடுக்கவும் / ஊழியரிடம் கேளுங்கள்.",
    },
    "book_fail_noappt": {
        "en": "I couldn’t confirm the booking just now. I’m retrying in the background — or ask staff to help.",
        "si": "දැන් වෙන්කිරීම තහවුරු කළ නොහැකි විය. පසුබිමින් නැවත උත්සාහ කරමින් සිටිමි — නැතහොත් කාර්ය මණ්ඩලයෙන් අසන්න.",
        "ta": "இப்போது முன்பதிவை உறுதிப்படுத்த முடியவில்லை. பின்னணியில் மீண்டும் முயற்சிக்கிறேன் — அல்லது ஊழியரிடம் கேளுங்கள்.",
    },
    "booked": {
        "en": "You’re booked! ✅\n*{service}*\n{date} at {time}\nRef: *#{ref}*\nSee you at {brand}!",
        "si": "වෙන්කිරීම සාර්ථකයි! ✅\n*{service}*\n{date} {time}\nRef: *#{ref}*\n{brand} හිදී හමුවෙමු!",
        "ta": "முன்பதிவு உறுதி! ✅\n*{service}*\n{date} {time}\nRef: *#{ref}*\n{brand} இல் சந்திப்போம்!",
        "sg": "Book una! ✅\n*{service}*\n{date} {time}\nRef: *#{ref}*\n{brand} eke hamuwemu!",
    },
    "slot_recheck_fail": {
        "en": "That time just became unavailable. Please pick another: {options}",
        "si": "ඒ වේලාව දැන් නිදහස් නැත. වෙනත් වේලාවක් තෝරන්න: {options}",
        "ta": "அந்த நேரம் இப்போது கிடைக்கவில்லை. வேறு நேரத்தைத் தேர்ந்தெடுக்கவும்: {options}",
        "sg": "Eka time eka dan free naha. Wena time ekak pick karanna: {options}",
    },
    # shared appointment list
    "known_cust": {
        "en": "Hi {name} — I found your account on this number.",
        "si": "ආයුබෝවන් {name} — මේ අංකයෙන් ඔබේ ගිණුම හොයාගත්තා.",
        "ta": "வணக்கம் {name} — இந்த எண்ணில் உங்கள் கணக்கைக் கண்டேன்.",
        "sg": "Hari {name} — me number eken oyage account eka identify kala.",
    },
    "no_appts": {
        "en": "I don’t see any upcoming appointments on this number.",
        "si": "මේ අංකයට ඉදිරි වෙන්කිරීම් කිසිවක් නැත.",
        "ta": "இந்த எண்ணில் வரவிருக்கும் முன்பதிவுகள் எதுவும் இல்லை.",
        "sg": "Me number eke upcoming appointments naha.",
    },
    "no_appts_named": {
        "en": "Hi {name} — no upcoming appointments on this number right now.",
        "si": "ආයුබෝවන් {name} — මේ අංකයට දැන් ඉදිරි වෙන්කිරීම් නැත.",
        "ta": "வணக்கம் {name} — இந்த எண்ணில் வரவிருக்கும் முன்பதிவுகள் இல்லை.",
        "sg": "Hari {name} — me number eke upcoming appointments naha.",
    },
    "appts_load_fail": {
        "en": "I couldn’t load your appointments right now. Please try again shortly.",
        "si": "දැන් ඔබේ වෙන්කිරීම් ලබාගත නොහැකි විය. මොහොතකින් නැවත උත්සාහ කරන්න.",
        "ta": "இப்போது உங்கள் முன்பதிவுகளை ஏற்ற முடியவில்லை. சிறிது நேரத்தில் மீண்டும் முயற்சிக்கவும்.",
        "sg": "Dæn appointments load karanna bari una. Mohothakin aye try karanna.",
    },
    "pick_number": {
        "en": "Reply with the appointment number from the list.",
        "si": "ලැයිස්තුවේ ඇති වෙන්කිරීමේ අංකය එවන්න.",
        "ta": "பட்டியலில் உள்ள முன்பதிவு எண்ணை அனுப்புங்கள்.",
        "sg": "List eke number eka reply karanna.",
    },
    "bad_number": {
        "en": "That number isn’t on the list. Try again.",
        "si": "ඒ අංකය ලැයිස්තුවේ නැත. නැවත උත්සාහ කරන්න.",
        "ta": "அந்த எண் பட்டியலில் இல்லை. மீண்டும் முயற்சிக்கவும்.",
        "sg": "Eka number eka list eke naha. Aye try karanna.",
    },
    # cancel
    "cancel_pick": {
        "en": "Which appointment should I cancel?\n{lines}\n\nReply with the number.",
        "si": "කුමන වෙන්කිරීම අවලංගු කරන්නද?\n{lines}\n\nඅංකය එවන්න.",
        "ta": "எந்த முன்பதிவை ரத்து செய்யவேண்டும்?\n{lines}\n\nஎண்ணை அனுப்புங்கள்.",
        "sg": "Monamada appointment eka cancel karanne?\n{lines}\n\nNumber eka reply karanna.",
    },
    "cancel_pick_named": {
        "en": "Hi {name} — which appointment should I cancel?\n{lines}\n\nReply with the number.",
        "si": "ආයුබෝවන් {name} — කුමන වෙන්කිරීම අවලංගු කරන්නද?\n{lines}\n\nඅංකය එවන්න.",
        "ta": "வணக்கம் {name} — எந்த முன்பதிவை ரத்து செய்யவேண்டும்?\n{lines}\n\nஎண்ணை அனுப்புங்கள்.",
        "sg": "Hari {name} — oyage appointments check kala. Monamada cancel karanne?\n{lines}\n\nNumber eka reply karanna.",
    },
    "cancel_confirm": {
        "en": "Cancel appointment #{id} on {date} {time}?\nReply *yes* to cancel it or *no* to keep it.",
        "si": "{date} {time} ට ඇති #{id} වෙන්කිරීම අවලංගු කරන්නද?\nඅවලංගු කිරීමට *yes* (ඔව්) හෝ තබාගැනීමට *no* (නැහැ) යවන්න.",
        "ta": "{date} {time} அன்று #{id} முன்பதிவை ரத்து செய்யவா?\nரத்து செய்ய *yes* (ஆம்), வைத்திருக்க *no* (இல்லை) என அனுப்புங்கள்.",
        "sg": "#{id} — {date} {time} appointment eka cancel karannada?\n*yes* = cancel, *no* = keep.",
    },
    "cancel_confirm_named": {
        "en": "Hi {name} — cancel appointment #{id} on {date} {time}?\nReply *yes* to cancel it or *no* to keep it.",
        "si": "ආයුබෝවන් {name} — {date} {time} ට ඇති #{id} වෙන්කිරීම අවලංගු කරන්නද?\n*yes* හෝ *no* යවන්න.",
        "ta": "வணக்கம் {name} — {date} {time} அன்று #{id} முன்பதிவை ரத்து செய்யவா?\n*yes* அல்லது *no* அனுப்புங்கள்.",
        "sg": "Hari {name} — #{id} ({date} {time}) cancel karannada?\n*yes* = cancel, *no* = keep.",
    },
    "cancel_confirm_redo": {
        "en": "Please reply *yes* to cancel appointment #{id} or *no* to keep it.",
        "si": "#{id} වෙන්කිරීම අවලංගු කිරීමට *yes* හෝ තබාගැනීමට *no* යවන්න.",
        "ta": "#{id} முன்பதிவை ரத்து செய்ய *yes*, வைத்திருக்க *no* என அனுப்புங்கள்.",
        "sg": "#{id} cancel karanna *yes*, keep karanna *no* kiyanna.",
    },
    "cancel_kept": {
        "en": "Okay — I kept appointment #{id}. Nothing was cancelled.",
        "si": "හරි — #{id} වෙන්කිරීම තබාගත්තා. කිසිවක් අවලංගු කළේ නැත.",
        "ta": "சரி — #{id} முன்பதிவை வைத்திருக்கிறேன். எதுவும் ரத்து செய்யப்படவில்லை.",
        "sg": "Hari — #{id} kept. Cancel karala naha.",
    },
    "cancel_fail": {
        "en": "Couldn’t cancel that appointment ({err}).",
        "si": "ඒ වෙන්කිරීම අවලංගු කළ නොහැකි විය ({err}).",
        "ta": "அந்த முன்பதிவை ரத்து செய்ய முடியவில்லை ({err}).",
        "sg": "Eka appointment eka cancel karanna bari una ({err}).",
    },
    "cancelled": {
        "en": "Cancelled appointment #{id} on {date} {time}.",
        "si": "{date} {time} ට ඇති #{id} වෙන්කිරීම අවලංගු කළා.",
        "ta": "{date} {time} அன்று #{id} முன்பதிவு ரத்து செய்யப்பட்டது.",
        "sg": "Cancelled ✅ #{id} — {date} {time}.",
    },
    # reschedule
    "resched_pick": {
        "en": "Which appointment would you like to reschedule?\n{lines}\n\nReply with the number.",
        "si": "කුමන වෙන්කිරීම නැවත වේලාව වෙනස් කරන්නද?\n{lines}\n\nඅංකය එවන්න.",
        "ta": "எந்த முன்பதிவின் நேரத்தை மாற்ற வேண்டும்?\n{lines}\n\nஎண்ணை அனுப்புங்கள்.",
    },
    "resched_ask_date": {
        "en": "Appointment #{id} is currently {date} {time}.\nWhat new date would you like? (today / tomorrow / Monday / YYYY-MM-DD)",
        "si": "#{id} වෙන්කිරීම දැනට {date} {time}.\nඅලුත් දිනය කුමක්ද? (අද / හෙට / සඳුදා / YYYY-MM-DD)",
        "ta": "#{id} முன்பதிவு தற்போது {date} {time}.\nபுதிய தேதி எது? (இன்று / நாளை / திங்கள் / YYYY-MM-DD)",
    },
    "resched_no_staff": {
        "en": "I can’t reschedule that appointment automatically. Please ask a staff member to help.",
        "si": "ඒ වෙන්කිරීම ස්වයංක්‍රීයව වෙනස් කළ නොහැක. කරුණාකර කාර්ය මණ්ඩලයෙන් අසන්න.",
        "ta": "அந்த முன்பதிவை தானாக மாற்ற முடியவில்லை. தயவுசெய்து ஊழியரிடம் கேளுங்கள்.",
    },
    "resched_same": {
        "en": "That’s the same time as your current appointment. Please pick a different time: {options}",
        "si": "ඒ දැනට ඇති වේලාවමයි. වෙනත් වේලාවක් තෝරන්න: {options}",
        "ta": "இது தற்போதைய நேரமே. வேறு நேரத்தைத் தேர்ந்தெடுக்கவும்: {options}",
    },
    "resched_keep_prefix": {
        "en": "Okay — I kept your appointment #{id} as it was.",
        "si": "හරි — #{id} වෙන්කිරීම කලින් පරිදිම තබාගත්තා.",
        "ta": "சரி — #{id} முன்பதிவை முன்பு இருந்தபடியே வைத்திருக்கிறேன்.",
    },
    "resched_confirm_redo": {
        "en": "Please reply *yes* to confirm the new time or *no* to keep your current appointment.",
        "si": "අලුත් වේලාව තහවුරු කිරීමට *yes* හෝ දැනට ඇති එක තබාගැනීමට *no* යවන්න.",
        "ta": "புதிய நேரத்தை உறுதிப்படுத்த *yes*, தற்போதையதை வைத்திருக்க *no* என அனுப்புங்கள்.",
    },
    "resched_yes_no": {
        "en": "Reply *yes* to reschedule or *no* to keep your current appointment.",
        "si": "වෙනස් කිරීමට *yes* (ඔව්) හෝ දැනට ඇති එක තබාගැනීමට *no* (නැහැ) යවන්න.",
        "ta": "மாற்ற *yes* (ஆம்), தற்போதையதை வைத்திருக்க *no* (இல்லை) என அனுப்புங்கள்.",
    },
    "resched_conflict": {
        "en": "That time was just taken. Please send another date (today / tomorrow / YYYY-MM-DD).",
        "si": "ඒ වේලාව දැන් වෙන් වී ඇත. කරුණාකර වෙනත් දිනයක් එවන්න (අද / හෙට / YYYY-MM-DD).",
        "ta": "அந்த நேரம் இப்போது எடுக்கப்பட்டுவிட்டது. வேறு தேதியை அனுப்புங்கள் (இன்று / நாளை / YYYY-MM-DD).",
    },
    "resched_fail": {
        "en": "I couldn’t reschedule that appointment ({err}). Your original booking is unchanged — please try again or ask staff.",
        "si": "ඒ වෙන්කිරීම වෙනස් කළ නොහැකි විය ({err}). ඔබේ මුල් වෙන්කිරීම වෙනස් වී නැත — නැවත උත්සාහ කරන්න හෝ කාර්ය මණ්ඩලයෙන් අසන්න.",
        "ta": "அந்த முன்பதிவை மாற்ற முடியவில்லை ({err}). உங்கள் அசல் முன்பதிவு மாறவில்லை — மீண்டும் முயற்சிக்கவும் அல்லது ஊழியரிடம் கேளுங்கள்.",
    },
    "resched_done": {
        "en": "Rescheduled! ✅\nAppointment #{id}: {old_date} {old_time} → *{date} {time}*\n{label}See you at {brand}!",
        "si": "වෙනස් කළා! ✅\n#{id} වෙන්කිරීම: {old_date} {old_time} → *{date} {time}*\n{label}{brand} හිදී හමුවෙමු!",
        "ta": "மாற்றப்பட்டது! ✅\n#{id} முன்பதிவு: {old_date} {old_time} → *{date} {time}*\n{label}{brand} இல் சந்திப்போம்!",
    },
}


_script_ctx: ContextVar[str] = ContextVar("booking_script_mode", default="english")


def t(lang: str, key: str, script_mode: Optional[str] = None, **kw: Any) -> str:
    entry = _T[key]
    mode = (script_mode or _script_ctx.get() or "").strip().lower()
    # Singlish customers get Latin-mix WhatsApp copy (sg), not formal සිංහල
    if mode == "singlish" and entry.get("sg"):
        tpl = entry["sg"]
    else:
        tpl = entry.get(lang) or entry.get("sg") or entry["en"]
    return tpl.format(**kw) if kw else tpl


@dataclass
class BookingDraft:
    branch_id: Optional[int] = None
    service_id: Optional[int] = None
    service_name: Optional[str] = None
    duration: int = 30
    # Extra services combined into one visit: [{id, name, duration_minutes}, ...]
    extra_services: list = field(default_factory=list)
    staff_id: Optional[int] = None
    staff_name: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    # cancel / reschedule: upcoming appointments offered to the customer + the one chosen
    cancel_candidates: list = field(default_factory=list)
    target: Optional[dict] = None


@dataclass
class Session:
    state: str = IDLE
    draft: BookingDraft = field(default_factory=BookingDraft)
    services: list = field(default_factory=list)
    staff: list = field(default_factory=list)
    slots: list = field(default_factory=list)
    mode: str = "book"  # book | cancel | reschedule
    lang: str = "en"  # en | si | ta
    script_mode: str = "english"  # singlish | sinhala | tamil | english
    # When True, booking step is preserved but Gemini answers the latest ask first.
    paused: bool = False
    pause_reason: Optional[str] = None
    # RC7 conversation truth — structured fields Gemini must not freely overwrite
    truth: dict = field(default_factory=dict)
    last_ai_prompt: Optional[str] = None  # last step question we asked (for short-msg context)


def _draft_services_list(draft: BookingDraft) -> list[dict[str, Any]]:
    """Primary + extra services for combined visit. draft.duration = primary only."""
    out: list[dict[str, Any]] = []
    if draft.service_id or draft.service_name:
        out.append({
            "id": draft.service_id,
            "name": draft.service_name or "Service",
            "duration_minutes": max(5, int(draft.duration or 30)),
        })
    for x in draft.extra_services or []:
        if not isinstance(x, dict):
            continue
        xid = x.get("id")
        if xid and any(s.get("id") == xid for s in out):
            continue
        out.append({
            "id": xid,
            "name": x.get("name") or "Service",
            "duration_minutes": max(5, int(x.get("duration_minutes") or 30)),
        })
    return out


def _draft_total_duration(draft: BookingDraft) -> int:
    """Sum minutes for all services in this visit (min 15)."""
    services = _draft_services_list(draft)
    if not services:
        return max(15, int(draft.duration or 30))
    return max(15, sum(int(s.get("duration_minutes") or 30) for s in services))


def _end_hhmm(start: str, mins: int) -> str:
    """Start HH:MM + duration → end HH:MM (same-day wrap)."""
    try:
        h, m = map(int, str(start or "00:00")[:5].split(":"))
    except ValueError:
        return str(start or "")[:5]
    total = (h * 60 + m + max(0, int(mins or 0))) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def _services_label(draft: BookingDraft) -> str:
    names = [str(s.get("name") or "").strip() for s in _draft_services_list(draft) if s.get("name")]
    names = [n for n in names if n]
    if not names:
        return draft.service_name or "Service"
    return " + ".join(names)


def _period_band_from_message(text: str) -> Optional[str]:
    t_ = _norm(text)
    if re.search(r"\bmorning\b|\bude\b|\budeta\b|උදේ|காலை", t_):
        return "morning"
    if re.search(r"\bafternoon\b|\bdawal\b|දවල්|மதியம்|lunch", t_):
        return "afternoon"
    if re.search(r"\bevening\b|\bsawasa\b|සවස|රෑ|மாலை|night", t_):
        return "evening"
    return None


def _is_period_only_message(text: str) -> bool:
    """True when customer only named a day-part (no clock) — list that band."""
    if _parse_time(text):
        return False
    if not _period_band_from_message(text):
        return False
    t_ = _norm(text)
    t2 = re.sub(
        r"\b(?:today|tomorrow|tomoro|ade|aade|ada|heta|hete|hetta|heya|please|hari|oka|ok)\b",
        " ",
        t_,
    )
    t2 = re.sub(r"\s+", " ", t2).strip()
    return bool(re.fullmatch(
        r"(?:morning|ude|udeta|afternoon|dawal|evening|sawasa|lunch|"
        r"උදේ|දවල්|සවස|காலை|மதியம்|மாலை)(?:\s+time(?:s)?)?",
        t2,
    ))


def session_key(tenant_id: int, conversation_id: Optional[int], phone: Optional[str]) -> str:
    # Prefer conversation id for multi-replica Redis key (C12)
    return f"{tenant_id}:{conversation_id or 0}:{phone or 'unknown'}"


def _session_to_dict(sess: Session) -> dict[str, Any]:
    return {
        "state": sess.state,
        "mode": sess.mode,
        "lang": sess.lang,
        "script_mode": getattr(sess, "script_mode", None) or "english",
        "paused": bool(getattr(sess, "paused", False)),
        "pause_reason": getattr(sess, "pause_reason", None),
        "draft": asdict(sess.draft),
        "services": sess.services,
        "staff": sess.staff,
        "slots": sess.slots,
        "truth": getattr(sess, "truth", None) or {},
        "last_ai_prompt": getattr(sess, "last_ai_prompt", None),
    }


def _session_from_dict(data: Optional[dict[str, Any]]) -> Session:
    if not data:
        return Session()
    draft_raw = data.get("draft") or {}
    draft = BookingDraft(**{k: draft_raw.get(k) for k in BookingDraft.__dataclass_fields__})
    draft.cancel_candidates = draft.cancel_candidates or []
    draft.extra_services = list(draft.extra_services or [])
    draft.duration = draft.duration or 30
    lang = data.get("lang")
    sm = str(data.get("script_mode") or "english").strip().lower()
    if sm not in ("singlish", "sinhala", "tamil", "english"):
        sm = "english"
    return Session(
        state=data.get("state") or IDLE,
        draft=draft,
        services=data.get("services") or [],
        staff=data.get("staff") or [],
        slots=data.get("slots") or [],
        mode=data.get("mode") or "book",
        lang=lang if lang in ("en", "si", "ta") else "en",
        script_mode=sm,
        paused=bool(data.get("paused")),
        pause_reason=(str(data.get("pause_reason")).strip() if data.get("pause_reason") else None),
        truth=data.get("truth") if isinstance(data.get("truth"), dict) else {},
        last_ai_prompt=(str(data["last_ai_prompt"]) if data.get("last_ai_prompt") else None),
    )


def _truth(sess: Session) -> ConversationTruth:
    return ConversationTruth.from_dict(getattr(sess, "truth", None) or {})


def _save_truth(sess: Session, truth: ConversationTruth) -> None:
    sess.truth = truth.to_dict()


def _sync_truth_from_draft(sess: Session, *, source: str = "draft") -> None:
    truth = _truth(sess)
    bump_turn(truth)
    d = sess.draft
    if d.service_id:
        set_field(truth, "selected_service_id", int(d.service_id), source=source, confidence=0.95, confirmed=True)
    if d.service_name:
        set_field(truth, "selected_service_name", d.service_name, source=source, confidence=0.95, confirmed=True)
    if d.duration:
        set_field(truth, "service_duration", int(d.duration), source=source, confidence=0.95, confirmed=True)
    if d.date:
        set_field(truth, "preferred_date", d.date, source=source, confidence=0.95, confirmed=True)
    if d.time:
        set_field(truth, "preferred_time", d.time, source=source, confidence=0.95, confirmed=True)
    if d.branch_id:
        set_field(truth, "selected_branch", int(d.branch_id), source=source, confidence=0.8)
    if sess.services:
        props = [
            {
                "id": s.get("id"),
                "name": s.get("name"),
                "duration_minutes": s.get("duration_minutes"),
            }
            for s in (sess.services or [])[:12]
            if isinstance(s, dict)
        ]
        set_field(truth, "proposed_services", props, source=source, confidence=0.9)
    set_field(truth, "current_intent", sess.state, source=source, confidence=0.7)
    _save_truth(sess, truth)


def get_session(key: str) -> Session:
    return _session_from_dict(load_session_raw(key))


def save_session(key: str, sess: Session) -> None:
    save_session_raw(key, _session_to_dict(sess))


def reset_session(key: str) -> None:
    delete_session(key)
    save_session_raw(key, _session_to_dict(Session()))


def _norm(text: str) -> str:
    t_ = re.sub(r"\s+", " ", (text or "").strip().lower())
    # Common Singlish / typo fixes for service matching
    t_ = re.sub(r"\bhire\s*cut\b", "hair cut", t_)
    t_ = re.sub(r"\bhaircut\b", "hair cut", t_)
    t_ = re.sub(r"\bkra\s*gnn\b", "karaganna", t_)
    t_ = re.sub(r"\bthiyenne\b", "thiyenne", t_)  # keep; list-ask regex uses thiyenne
    return t_


def _message_tokens(text: str) -> list[str]:
    """Whitespace/punctuation tokens only — never substring-of-word matching."""
    t_ = _norm(text)
    if not t_:
        return []
    return [p for p in re.split(r"[^\w\u0B80-\u0BFF\u0D80-\u0DFF]+", t_, flags=re.UNICODE) if p]


def is_exact_confirm(message: str) -> bool:
    """Accept only exact intent tokens (C3). Rejects yesterday/july/know."""
    tokens = _message_tokens(message)
    if not tokens:
        return False
    if len(tokens) == 1 and tokens[0] in CONFIRM_TOKENS:
        return True
    if _norm(message) in CONFIRM_TOKENS:
        return True
    return False


def is_exact_decline(message: str) -> bool:
    tokens = _message_tokens(message)
    if not tokens:
        return False
    if len(tokens) == 1 and tokens[0] in DECLINE_TOKENS:
        return True
    if _norm(message) in DECLINE_TOKENS:
        return True
    return False


def _is_decline_keep(message: str) -> bool:
    """Decline for a cancel-appointment confirm: bare 'cancel' is ambiguous here, not a 'no'."""
    return is_exact_decline(message) and _message_tokens(message) != ["cancel"]


# ── Intent ───────────────────────────────────────────────────────────────────

_ABORT_RE = re.compile(r"\b(?:stop|never\s*mind|nvm|forget\s+it|exit|cancel\s+booking\s+flow)\b")

_CANCEL_RE = re.compile(
    r"\bcancel\s+(?:my|the|this|that|our)\s+(?:appointment|booking|reservation|visit|slot|appoinment|appoimnet)s?\b"
    r"|\bcancel\s+(?:appointment|booking|reservation|appoinment|appoimnet)\b"
    # Singlish: "cancel karann oni appointment" / "mage appointment eka cancel karanna"
    r"|\bcancel\s+karan\w*"
    r"|\b(?:appointment|appoinment|appoimnet|booking|reservation)s?\b.{0,48}\bcancel\b"
    r"|\bcancel\b.{0,48}\b(?:appointment|appoinment|appoimnet|booking|reservation)s?\b"
    r"|\bremove\s+(?:my\s+)?(?:booking|appointment)\b"
    r"|අවලංගු|ரத்து"
)

_RESCHEDULE_RE = re.compile(
    r"\bre-?schedul\w*\b"
    r"|\bpostpone\b"
    r"|\bchange\s+(?:my|the)\s+(?:appointment|booking|time|date)\b"
    r"|\bmove\s+(?:my|the)\s+(?:appointment|booking)\b"
    r"|\b(?:another|different|new)\s+(?:time|date|day)\s+for\s+(?:my|the)\s+(?:appointment|booking)\b"
    # Singlish: "appointment eka change karanna" / "reschedule karann"
    r"|\breschedule\s+karan\w*"
    r"|\b(?:appointment|appoinment|appoimnet|booking)\b.{0,40}\b(?:change|move|reschedule)\b"
    r"|\b(?:change|move)\b.{0,40}\b(?:appointment|appoinment|appoimnet|booking)\b"
    r"|වෙලාව\s*වෙනස්|දිනය\s*වෙනස්|නැවත\s*වෙන්|நேரத்தை\s*மாற்ற|தேதியை\s*மாற்ற"
)

# Words that clearly mean "start a booking". "available"/"i want" alone do NOT.
_BOOK_WORD_RE = re.compile(
    r"\b(?:book|booking|bookings|reserve|reservation|"
    r"appointments?|appoinments?|appoimnets?|appoitments?|"
    r"schedule|slots?)\b"
    r"|\b(?:make|get|need|want|fix|do)\s+(?:an?\s+|a\s+)?(?:appointment|booking|reservation)\b"
    r"|\bcan\s+(?:u|you)\s+(?:make|book|fix)\b"
    r"|වෙන්\s*කර|වෙන්කර|බුක්|முன்பதிவு|புக்"
)
_SERVICE_WORD_RE = re.compile(
    r"\b(?:hair\s*cut|haircut|trim|colou?r(?:ing)?|facial|massage|manicure|pedicure|bridal|"
    r"waxing|threading|spa|keratin|rebonding|botox|hair\s*treatment|treatment|"
    r"dressing|hair\s*dressing|hair\s*style|blow\s*dry|nails?|"
    r"beard|shave|cleanup|clean\s*up|eyebrow|makeup|mehandi|henna|highlights?|ombre)\b"
    r"|හෙයාර්|කට්|ෆේෂල්|මැනිකියර්|පෙඩිකියර්|ට්‍රීට්මන්ට්|ඩ්‍රසින්"
)
# English + Singlish/Sinhala transliteration ("mata oni", "kara ganna")
_WANT_RE = re.compile(
    r"\b(?:i\s+want|i\s+need|i'?d\s+like|id\s+like|i\s+would\s+like|want\s+to|looking\s+for|"
    r"can\s+i\s+(?:get|have|do)|available|availability|"
    r"oni|ona|onai|mata\s*oni|mata\s*ona|karaganna|kara\s*ganna|karanna|ganna)\b"
    r"|ඕනේ?|මට\s*ඕන|කරගන්න|කරන්න|வேண்டும்"
)
# Real booking *actions* — these win over FAQ words ("book a haircut, how much is it?").
# Note: bare "oni"/"ona" alone must NOT force booking (detail asks / corrections).
_BOOK_ACTION_RE = re.compile(
    r"\b(?:book|reserve|schedule)\b"
    r"|\b(?:make|get|need|want|fix|do)\s+(?:an?\s+|a\s+)?"
    r"(?:appointment|appoinment|appoimnet|booking|reservation)\b"
    r"|\b(?:appointment|appoinment|appoimnet)\s+for\b"
    r"|\bcan\s+(?:u|you)\s+(?:make|book|fix)\b"
    r"|වෙන්\s*කර|වෙන්කර|முன்பதிவு"
)

# "details before I book" / enquire first — never start booking SM
_DETAILS_BEFORE_BOOK_RE = re.compile(
    r"(?:book|booking|appointment).{0,40}(?:kalin|before).{0,20}(?:detail|kiyana|danaganna|explain)"
    r"|(?:detail|kiyana|danaganna|explain).{0,40}(?:kalin|before).{0,20}(?:book|booking)"
    r"|\bbook\s+kara\s+gann\s+kalin\b"
    r"|\bbefore\s+(?:i\s+)?book\b",
    re.I,
)

# Customer says previous AI reply was wrong / irrelevant
_CORRECTION_RE = re.compile(
    r"\bahana\s+deta\b|\bahanna\s+deta\b|\baahan\s+deta\b"
    r"|\bnemei\b|\bnemeiy\b|\bneme\b|\bnewei\b|\bනෙමෙ(?:යි)?\b|\bනොවේ\b|\bනෙවෙි\b"
    r"|\breply\s+denn\b|\breply\s+denna\b|\breply\s+karanna\b"
    r"|\bmama\s+ahuwe\b|\bmama\s+ahuve\b|\bahuwe\s+wena\b"
    r"|\bmama\s+keewe\b|\bkeewe\b.{0,40}\bnewei\b"
    r"|\bcheck\s+history\b|\bsee\s+history\b|\bread\s+(?:the\s+)?history\b|\bchat\s+history\b"
    r"|\beka\s+nemei\b|\boya\s+therum\b|\btherum\s+ganna\b"
    r"|\bquestion\s+ekata\b|\bwrong\s+answer\b|\bnot\s+what\s+i\s+(?:asked|said|meant)\b"
    r"|\bthat'?s\s+not\s+(?:what|right|correct)\b|\bi\s+asked\s+(?:something|a\s+different)\b"
    r"|\banswer\s+(?:the\s+)?(?:question|ask)\b"
    r"|\bprice\s+aka\s+newei\b|\btime\s+aka\s+newei\b"
    r"|\bi\s+meant\b|\bi\s+mean\b|\bwrong\s*[—\-,]?\s*i\s+meant\b"
    r"|\bnaha\s+.{0,20}\s+eka\b|\bnot\s+facial\b|\bwena\s+eka\s+keewe\b",
    re.I,
)

_MEDIA_PLACEHOLDER_RE = re.compile(
    r"\[Customer sent a (?:photo|voice note)\]",
    re.I,
)

_RESUME_BOOKING_RE = re.compile(
    r"\b(?:continue|resume|carry\s*on|proceed|go\s+ahead)\b"
    r"|\b(?:continue|resume)\s+(?:book|booking|appointment)\b"
    r"|\bbook(?:ing)?\s+(?:eka\s+)?(?:continue|resume)\b"
    r"|\bhari\s+ehenam\b|\behenam\s+book\b|\bbook\s+karamu\b"
    r"|\bback\s+to\s+(?:book|booking)\b"
    r"|ඉදිරියට|දිගටම",
    re.I,
)

_FAQ_RE = re.compile(
    r"\b(?:opening|closing|working|business|open)\s+(?:hours?|times?)\b|\bhours\b"
    r"|\bwhat\s+time\s+(?:do|does|are|is)\s+(?:you|u|the\s+salon|it)\s+(?:open|close|closing|opening)\b"
    r"|\bwhen\s+(?:do|does|are|is)\s+(?:you|u|the\s+salon)\s+(?:open|close|opening|closing)\b"
    r"|\b(?:are\s+you|is\s+the\s+salon)\s+open\b"
    r"|\bwhere\s+(?:are\s+you|is\s+the\s+salon)\b|\bwhere\s+(?:are\s+you\s+)?located\b"
    r"|\b(?:location|address|directions?|parking)\b|\bhow\s+(?:do\s+i|to)\s+(?:get|reach)\b"
    # Singlish location / duration FAQ (post-handoff follow-ups)
    r"|\b(?:koheda|kohada|kohe|salon\s+eka|kandy)\b"
    r"|\b(?:kochchara|duration|how\s+long|minutes?|wela\s*yai|wela\s*yanne)\b"
    r"|\b(?:price|prices|pricing|cost|costs|how\s+much|charges?|rates?|fees?)\b"
    r"|\b(?:price|mila|cost)\s*eka\b|\bmila\b|\bgana\b|\bganada\b"
    r"|මිල|ලිපිනය|විවෘත|කීයද|ගාන|ගණන්|කොහෙද|කොච්චර|விலை|முகவரி"
)

# Mid-booking: customer asked something else (must go to Gemini to understand)
_SIDE_ASK_RE = re.compile(
    r"\?"
    r"|\b(?:price|prices|cost|mila|gana|ganada|how\s+much|කීයද|ගාන|ගණන්|"
    r"monawada|mokakda|mokadda|monda|mond|monada|thiyenne|thiyenwad|thiyenawada|"
    r"kohomada|kiyanna|kiyanawada|therenne|dannawa|"
    r"what\s+is|what\s+are|how\s+(?:to|much|long|many)|where|which|why|"
    r"offer|promo|discount|hours|open|close|location|address|"
    r"treatment|dressing|bridal|package|packages|"
    r"කොහෙද|කොහොමද|මොකක්ද|මොනවද|කියන්න|තේරෙන්නේ|තියෙන්නේ|"
    r"eke\s+ganna|eka\s+kiyanna|details?|explain)\b",
    re.I,
)


def is_faq_message(text: str) -> bool:
    """Clear FAQ (hours / location / price) that isn't actually asking to book."""
    t_ = _norm(text)
    if not t_:
        return False
    if _BOOK_ACTION_RE.search(t_):
        return False
    return bool(_FAQ_RE.search(t_))


_GREETING_RE = re.compile(
    r"^(?:hi+|hii+|hello|hey+|hai|ayo+|ayubowan|ආයුබෝවන්|வணக்கம்)[\s!.]*$",
    re.I,
)


def is_greeting_message(text: str) -> bool:
    t = str(text or "").strip()
    if not t or len(t) > 40:
        return False
    return bool(_GREETING_RE.match(t))


def is_media_message(text: str, *, has_media: bool = False) -> bool:
    """True when this turn is (or was) a WhatsApp photo/voice attachment."""
    if has_media:
        return True
    return bool(_MEDIA_PLACEHOLDER_RE.search(str(text or "")))


def is_correction_message(text: str) -> bool:
    """Customer says the previous reply missed / mismatched their question."""
    return bool(_CORRECTION_RE.search(str(text or "")))


def is_resume_booking_message(text: str) -> bool:
    """Explicit continue/resume after a safe booking pause."""
    return bool(_RESUME_BOOKING_RE.search(_norm(text)))


def is_details_before_book(text: str) -> bool:
    """Customer wants info first — must not enter booking SM."""
    return bool(_DETAILS_BEFORE_BOOK_RE.search(str(text or "")))


def expected_step_for_state(state: str) -> str:
    return {
        AWAIT_SERVICE: "service",
        AWAIT_STAFF: "service",
        AWAIT_DATE: "date",
        AWAIT_TIME: "time",
        AWAIT_NAME: "name",
        AWAIT_CONFIRM: "confirm",
        AWAIT_CANCEL_PICK: "pick",
        AWAIT_CANCEL_CONFIRM: "confirm",
        AWAIT_RESCHED_PICK: "pick",
        AWAIT_RESCHED_DATE: "date",
        AWAIT_RESCHED_TIME: "time",
        AWAIT_RESCHED_CONFIRM: "confirm",
    }.get(state or "", "")


def _is_slot_list_ask(text: str) -> bool:
    """Customer wants to see available start times (keep in booking SM)."""
    t_ = _norm(text)
    return bool(
        re.search(
            r"\b(?:time\s*slots?|slots?|available\s+times?|start\s+times?)\b"
            r"|\bmage\s+time|\bwelawak|\bwela\s*yanne|\bwada\s*\d|\bjobs?\b"
            r"|වේලා|slot",
            t_,
        )
    )


def is_clear_step_answer(text: str, *, expected: str = "") -> bool:
    """
    True only when the message is a clear answer to the pending booking step.
    Ambiguous / new questions must NOT count as step answers.
    """
    t_ = _norm(text)
    if not t_ or not expected:
        return False
    if is_media_message(text) or is_correction_message(text) or is_details_before_book(text):
        return False
    if is_faq_message(t_) or is_greeting_message(text):
        return False
    if expected == "date":
        return bool(_valid_future_date(_parse_date(text)))
    if expected == "time":
        if _parse_time(text):
            return True
        if _is_slot_list_ask(text):
            return True
        # Singlish periods + "damu/danna" time commits must stay in booking SM
        return bool(
            re.search(
                r"\b(?:morning|afternoon|evening|ude|udeta|dawal|sawasa|"
                r"උදේ|දවල්|සවස|காலை|மதியம்|மாலை)\b"
                r"|\b(?:damu|danna|fix|book)\b.*\b\d{1,2}\b"
                r"|\b\d{1,2}\b.*\b(?:damu|danna|ta)\b",
                t_,
            )
        )
    if expected == "confirm":
        return bool(is_exact_confirm(text) or is_exact_decline(text))
    if expected == "name":
        if len(t_.split()) <= 4 and not _SIDE_ASK_RE.search(t_) and not re.search(r"\?", text or ""):
            return True
        return False
    if expected == "service":
        if re.match(r"^\d{1,2}$", t_):
            return True
        if _SERVICE_WORD_RE.search(t_) and not re.search(r"\?", text or ""):
            if not _SIDE_ASK_RE.search(t_) or _WANT_RE.search(t_):
                return True
        return False
    if expected == "pick":
        return bool(re.search(r"\d", t_))
    return False


def is_side_ask(text: str, *, expected: str = "") -> bool:
    """
    True when the customer is NOT answering the booking step — they asked
    something else. Booking SM must pause so Gemini can understand every message.
    """
    t_ = _norm(text)
    if not t_:
        return False
    if is_clear_step_answer(text, expected=expected):
        return False
    if expected == "time" and _is_slot_list_ask(text):
        return False
    # Mid-booking "hi" must not loop the date prompt — hand to Gemini
    if is_greeting_message(text):
        return True
    if is_media_message(text) or is_correction_message(text) or is_details_before_book(text):
        return True
    if is_faq_message(t_) or _SIDE_ASK_RE.search(t_):
        return True
    # Keratin / treatment names without being a clear service pick
    if expected in ("date", "time", "name", "confirm") and _SERVICE_WORD_RE.search(t_):
        return True
    # Default for non-answers: treat as a new ask (latest question wins)
    if expected and not is_clear_step_answer(text, expected=expected):
        return True
    return False


def _pause_booking(sess: Session, actions: list, reason: str) -> None:
    """Preserve booking progress; mark paused so Gemini answers first."""
    if sess.state == IDLE:
        return
    sess.paused = True
    sess.pause_reason = reason
    d = sess.draft
    actions.append(
        {
            "tool": "booking_pause_for_understanding",
            "ok": True,
            "state": sess.state,
            "reason": reason,
            "paused": True,
            "service": d.service_name,
            "service_id": d.service_id,
            "date": d.date,
            "time": d.time,
            "draft_preserved": True,
        }
    )


def _yield_to_llm(sess: Session, actions: list) -> dict[str, Any]:
    """
    Yield control to Gemini/pricing while keeping pause actions on the turn.
    Must NOT return None — callers merge these actions into TurnResponse.
    Idempotent: pause tool already appended by _pause_booking; do not re-fire book/cancel.
    """
    return {
        "yieldToLlm": True,
        "replyText": "",
        "actions": list(actions),
        "flowState": sess.state,
        "flowPaused": bool(getattr(sess, "paused", False)),
        "booking": None,
    }


def _unpause_booking(sess: Session, actions: list, reason: str = "resume") -> None:
    if not sess.paused and not sess.pause_reason:
        return
    sess.paused = False
    sess.pause_reason = None
    actions.append({"tool": "booking_resume", "ok": True, "state": sess.state, "reason": reason})


def detect_intent(text: str, sess: Session) -> str:
    t_ = _norm(text)
    cancel_hit = bool(_CANCEL_RE.search(t_))
    resched_hit = bool(_RESCHEDULE_RE.search(t_))
    if sess.state != IDLE:
        if _ABORT_RE.search(t_):
            return "abort"
        # Mid-book: "cancel karann oni appointment" must leave book → cancel (not ask_date)
        if cancel_hit and sess.state not in CANCEL_STATES:
            return "cancel"
        if resched_hit and sess.state not in RESCHED_STATES:
            return "reschedule"
        return "continue"
    if cancel_hit:
        return "cancel"
    if resched_hit:
        return "reschedule"
    if is_details_before_book(text) or is_correction_message(text):
        return "chat"
    # Booking / appointment wins over FAQ (e.g. "can u make a appointment")
    if _BOOK_ACTION_RE.search(t_) or _BOOK_WORD_RE.search(t_):
        # "book … kalin details" is enquire-first, not book
        if is_details_before_book(text):
            return "chat"
        return "book"
    if is_faq_message(t_):
        return "chat"
    if _SERVICE_WORD_RE.search(t_) and _WANT_RE.search(t_):
        return "book"
    # Singlish: "mata oni hair cut" / "hair cut ekak karaganna" without English "want"
    if _SERVICE_WORD_RE.search(t_) and re.search(
        r"\b(?:ekak|eka|one|get|ganna|karanna|karaganna|kara\s*ganna|mata|mta)\b|එකක්|කරගන්න",
        t_,
    ):
        return "book"
    return "chat"


_HINT_SERVICE_RE = re.compile(
    r"\b(?:keratin|botox|rebonding|highlights?|ombr[eé]|blond\s*colou?r|crown|"
    r"ladies\s*hair\s*cut|gents\s*hair\s*cut|baby\s*hair\s*cut|hair\s*spa|"
    r"hydra\s*facial|full\s*dressing|manicure|pedicure|clean-?up|"
    r"hair\s*treatment|fashion\s*colou?r)\b",
    re.I,
)


def _hint_from_recent_chat(recent_messages: Optional[list] = None, memory: Optional[dict] = None) -> str:
    """Pull last discussed service so bare 'appointment' continues that service."""
    # 1) Most recent assistant mention wins (what we just quoted a price for)
    for m in reversed(recent_messages or []):
        if not isinstance(m, dict):
            continue
        role = str(m.get("role") or "").lower()
        content = str(m.get("content") or "")
        if role not in ("assistant", "ai", "agent") or not content:
            continue
        hit = _HINT_SERVICE_RE.search(content)
        if hit:
            return hit.group(0)[:80]
    # 2) Customer last named a service
    for m in reversed(recent_messages or []):
        if not isinstance(m, dict):
            continue
        role = str(m.get("role") or "").lower()
        content = str(m.get("content") or "")
        if role not in ("user", "customer") or not content:
            continue
        hit = _HINT_SERVICE_RE.search(content)
        if hit:
            return hit.group(0)[:80]
    # 3) CRM memory
    if isinstance(memory, dict):
        for key in ("last_service", "preferred_services"):
            val = memory.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()[:80]
            if isinstance(val, list):
                for x in val:
                    if str(x).strip():
                        return str(x).strip()[:80]
    return ""


# ── Parsing helpers ──────────────────────────────────────────────────────────

# (latin regex with word boundaries, Sinhala/Tamil names matched as plain substrings —
# \b is unreliable next to Indic combining marks)
_WEEKDAYS = [
    (r"mon(?:day)?", ("සඳුදා", "திங்கள்")),
    (r"tue(?:s(?:day)?)?", ("අඟහරුවාදා", "செவ்வாய்")),
    (r"wed(?:nesday)?", ("බදාදා", "புதன்")),
    (r"thu(?:r(?:s(?:day)?)?)?", ("බ්‍රහස්පතින්දා", "வியாழன்")),
    (r"fri(?:day)?", ("සිකුරාදා", "வெள்ளி")),
    (r"sat(?:urday)?", ("සෙනසුරාදා", "சனி")),
    (r"sun(?:day)?", ("ඉරිදා", "ஞாயிறு")),
]


def _parse_date(text: str, *, now: Optional[date] = None) -> Optional[str]:
    """
    Resolve dates against Asia/Colombo 'now' (never stale conversation clocks).
    Relative phrases (labana mase / 1laweni sathiye / me masene 11) go first.
    """
    today = now or today_colombo()
    t_ = _norm(text)
    raw = str(text or "").strip()

    # RC7: relative month / nth-weekday / day-in-month (Colombo)
    rel = parse_relative_date(raw, now=today)
    if rel.get("ok") and rel.get("date"):
        return str(rel["date"])
    if rel.get("ambiguous") and rel.get("clarify"):
        # Signal ambiguity via sentinel consumed by AWAIT_DATE (None + side channel)
        _parse_date.last_clarify = rel.get("clarify")  # type: ignore[attr-defined]
        return None

    # Today — English + Sinhala script + Singlish (ade/aade/ida)
    if (
        re.search(r"\b(?:today|tdy)\b", t_)
        or "අද" in t_
        or "இன்று" in t_
        or re.search(r"\b(?:ade|aade|ada|ida)\b", t_)
    ):
        return today.isoformat()
    # Tomorrow — English + Sinhala + Singlish (heta/hete/hetta + common typos heya/heyaa)
    if (
        re.search(r"\b(?:tomorrow|tomoro|tommorow|tmrw|tmr)\b", t_)
        or "හෙට" in t_
        or "நாளை" in t_
        or re.search(r"\b(?:heta|hete|hetta|hetaa|hitta|heya|heyaa|heyya|hetha)\b", t_)
    ):
        return (today + timedelta(days=1)).isoformat()
    # Day after tomorrow (Singlish)
    if re.search(r"\b(?:day\s*after\s*tomorrow|anidda|aniddha)\b", t_) or "අනිද්දා" in t_:
        return (today + timedelta(days=2)).isoformat()

    # If message has next/this month + weekday without ordinal, prefer relative clarify
    # rather than "next Saturday from today" which ignores the month intent.
    if re.search(r"\b(?:labana\s+mas|next\s+months?|me\s+mas|this\s+months?)\b", t_, re.I):
        _parse_date.last_clarify = (  # type: ignore[attr-defined]
            rel.get("clarify")
            or "Which exact date in that month? (e.g. first Saturday / 5 December)"
        )
        return None

    for i, (pat, native) in enumerate(_WEEKDAYS):
        # Singlish weekday short forms (sathiye = Saturday)
        singlish = {
            0: r"sanduda|handuda",
            1: r"angaharuwada|angaharu",
            2: r"badada|badaada",
            3: r"brahaspathinda|brahas",
            4: r"sikurada|sikura",
            5: r"senasurada|senasura|sani|sathiye|sathiya|sathida",
            6: r"irida|iridaa",
        }.get(i, "")
        if (
            re.search(rf"\b(?:{pat})\b", t_)
            or any(n in t_ for n in native)
            or (singlish and re.search(rf"\b(?:{singlish})\b", t_))
        ):
            delta = (i - today.weekday()) % 7
            if delta == 0:
                delta = 7
            resolved = today + timedelta(days=delta)
            # Validate weekday matches requested
            if resolved.weekday() != i:
                return None
            return resolved.isoformat()
    # YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
    m = re.search(r"(\d{4})[-./](\d{1,2})[-./](\d{1,2})", raw)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return None
    # DD-MM-YYYY / DD.MM.YYYY / DD/MM/YYYY
    m = re.search(r"(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})", raw)
    if m:
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        # Prefer DMY (LK common); fall back to MDY
        try:
            return date(y, b, a).isoformat()
        except ValueError:
            try:
                return date(y, a, b).isoformat()
            except ValueError:
                return None
    # DD/MM or DD-MM (current year, Colombo)
    m = re.search(r"(\d{1,2})[/-](\d{1,2})(?!\d)", raw)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        y = today.year
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            try:
                return date(y, d, mo).isoformat()
            except ValueError:
                return None
    # Bare day number while correcting month context is handled by parse_relative_date
    return None


_parse_date.last_clarify = None  # type: ignore[attr-defined]


def _valid_future_date(d: Optional[str], *, now: Optional[date] = None) -> Optional[str]:
    """Return d only if it is a real ISO date that is not in the past (Asia/Colombo)."""
    if not d:
        return None
    today = now or today_colombo()
    try:
        return d if date.fromisoformat(d) >= today else None
    except ValueError:
        return None


def _parse_time(text: str) -> Optional[str]:
    t_ = _norm(text)
    # Typo: "8.30an" / "8.30a" → am (common WhatsApp slip)
    t_ = re.sub(r"(\d{1,2}[.:]\d{2})\s*a(?:n)?\b", r"\1 am", t_)
    t_ = re.sub(r"(\d{1,2})\s*a(?:n)\b", r"\1 am", t_)
    m = re.search(r"\b(\d{1,2}):(\d{2})\s*(am|pm)?\b", t_)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        ap = m.group(3)
        if ap == "pm" and h < 12:
            h += 12
        if ap == "am" and h == 12:
            h = 0
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return f"{h:02d}:{mi:02d}"
    # "10am" / "10 am" / "10.00 am"
    m = re.search(r"\b(\d{1,2})(?:[.:](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b", t_)
    if m:
        h = int(m.group(1))
        mi = int(m.group(2) or 0)
        ap = (m.group(3) or "").replace(".", "")
        if ap.startswith("p") and h < 12:
            h += 12
        if ap.startswith("a") and h == 12:
            h = 0
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return f"{h:02d}:{mi:02d}"
    # "ude 9" / "morning 10" / "9 ta ude" — clock + period (must NOT return None)
    m = re.search(
        r"\b(?:morning|ude|udeta|උදේ)\b[^\d]{0,16}(\d{1,2})(?:[.:](\d{2}))?\b"
        r"|\b(\d{1,2})(?:[.:](\d{2}))?\s*(?:ta|ට)?\s*"
        r"(?:ude|udeta|morning|උදේ)\b",
        t_,
    )
    if m:
        h = int(m.group(1) or m.group(3) or 0)
        mi = int(m.group(2) or m.group(4) or 0)
        if 7 <= h <= 11:
            return f"{h:02d}:{mi:02d}"
        if 1 <= h <= 6:  # bare morning hour sometimes typed without 0-pad intent
            return f"{h:02d}:{mi:02d}"
    m = re.search(
        r"\b(?:afternoon|dawal|dawalta|දවල්)\b[^\d]{0,16}(\d{1,2})(?:[.:](\d{2}))?\b"
        r"|\b(\d{1,2})(?:[.:](\d{2}))?\s*(?:ta|ට)?\s*"
        r"(?:afternoon|dawal|දවල්)\b",
        t_,
    )
    if m:
        h = int(m.group(1) or m.group(3) or 0)
        mi = int(m.group(2) or m.group(4) or 0)
        if 1 <= h <= 11:
            h += 12
        if 12 <= h <= 20:
            return f"{h:02d}:{mi:02d}"
    # Bare period words without a clock — period picker handles bands
    if re.search(r"\b(?:morning|ude|udeta|afternoon|dawal|evening|sawasa|උදේ|දවල්|සවස)\b", t_):
        return None
    m = re.search(r"\b(\d{1,2})\b", t_)
    if m and ":" not in t_ and not re.search(r"\b(?:heta|hete|ade|aade|today|tomorrow)\b", t_):
        h = int(m.group(1))
        if 7 <= h <= 20:
            return f"{h:02d}:00"
    # "heta 10" without am/pm — salon daytime hours assume AM if 7-11, else as-is
    m = re.search(r"\b(\d{1,2})\b", t_)
    if m:
        h = int(m.group(1))
        if 7 <= h <= 11:
            return f"{h:02d}:00"
        if 12 <= h <= 20:
            return f"{h:02d}:00"
    return None


def _match_slot(want: str, slots: list[str]) -> Optional[str]:
    """Exact or same-hour available slot for a requested clock time."""
    if not want or not slots:
        return None
    if want in slots:
        return want
    try:
        wh, wm = map(int, want.split(":"))
    except ValueError:
        return None
    same_hour = []
    for s in slots:
        try:
            sh, sm = map(int, str(s).split(":"))
        except ValueError:
            continue
        if sh == wh:
            same_hour.append((abs(sm - wm), s))
    if same_hour:
        same_hour.sort()
        return same_hour[0][1]
    # nearest within 45 minutes
    scored = []
    for s in slots:
        try:
            sh, sm = map(int, str(s).split(":"))
        except ValueError:
            continue
        diff = abs((sh * 60 + sm) - (wh * 60 + wm))
        if diff <= 45:
            scored.append((diff, s))
    if scored:
        scored.sort()
        return scored[0][1]
    return None


_BOY_RE = re.compile(r"\b(?:boy|boys|gents?|men|man|male|him|gnts)\b", re.I)
_LADY_RE = re.compile(r"\b(?:girl|girls|lad(?:y|ies)|women|woman|female|her)\b", re.I)
_BABY_RE = re.compile(r"\b(?:baby|babies|kid|kids|child|children|infant)\b", re.I)
_SERVICE_LIST_ASK_RE = re.compile(
    r"(?:monawada|mokakda|mokadda|monada|monda|mond|what\s+services?|which\s+services?|"
    r"service\s*(?:list|monawada|mond|thiyenne|available|mind)|"
    r"thiyenne|thiyenwad|thiyenawada|server\s*mind|"
    r"hair\s*cut\s*services?|hair\s*treatment|treatment\s*(?:list|services?|mond)|"
    r"dressing\s*(?:service|list)?|bridal\s*(?:dressing|package)?|"
    r"services?\s*(?:for|of)?\s*hair|"
    r"මොනවාද|මොකක්ද|කුමන\s*සේවා|තියෙන්නේ)",
    re.I,
)

# Category intents — answer the ASKED type, never dump unrelated categories.
# Order matters: more specific intents before generic haircut / facial.
_CATEGORY_PATTERNS: list[tuple[str, re.Pattern[str], re.Pattern[str]]] = [
    (
        "cleanup",
        re.compile(r"\bclean[\s\-]*up|cleanup\b", re.I),
        re.compile(r"clean[\s\-]*up|cleanup", re.I),
    ),
    (
        "keratin",
        re.compile(r"\bkeratin|කෙරටින්\b", re.I),
        re.compile(r"keratin", re.I),
    ),
    (
        "straightening",
        re.compile(
            r"\b(?:hair\s*)?(?:straight(?:en(?:ing)?)?|rebond(?:ing)?|relax(?:ing)?)\b",
            re.I,
        ),
        re.compile(r"straight|rebond|relax", re.I),
    ),
    (
        "treatment",
        re.compile(
            r"\b(?:hair\s*)?treatment|botox|smooth(?:ing)?|protein|conditioning|"
            r"hair\s*spa|oil\s*treatment|anti[\s\-]*dandruff\b",
            re.I,
        ),
        re.compile(r"treatment|botox|rebond|smooth|protein|condition|mask|spa\s*hair|keratin", re.I),
    ),
    (
        "dressing",
        re.compile(r"\b(?:hair\s*)?dressing|hair\s*do|style\s*up|saree|lehenga|party\s*hair|hair\s*styl(?:e|ing)\b", re.I),
        re.compile(r"dressing|hair\s*do|style|bridal\s*hair|saree|lehenga|updo|hair\s*setting|blow\s*dry|iron", re.I),
    ),
    (
        "bridal",
        re.compile(r"\bbridal|bride|wedding\b", re.I),
        re.compile(r"bridal|bride|wedding|lehenga", re.I),
    ),
    (
        "color",
        re.compile(r"\b(?:hair\s*)?colou?r(?:ing)?|highlights?|ombre|balayage|blond|dye|grey\s*(?:cover|hair)\b", re.I),
        re.compile(r"colou?r|highlight|ombre|balayage|blond|dye|fashion\s*colour|grey", re.I),
    ),
    (
        "waxing",
        re.compile(r"\bwax(?:ing)?\b", re.I),
        re.compile(r"wax", re.I),
    ),
    (
        "eyebrow",
        re.compile(r"\beyebrows?|eye\s*brow|brow\s*(?:shape|shaping|thread)?\b", re.I),
        re.compile(r"eyebrow|brow", re.I),
    ),
    (
        "threading",
        re.compile(r"\bthread(?:ing)?\b", re.I),
        re.compile(r"thread", re.I),
    ),
    (
        "facial",
        re.compile(r"\bfacial|skin\s*care|hydra\s*facial|පෙත්ත|මුහුණ\b", re.I),
        re.compile(r"facial|hydra|skin|glow|peel", re.I),
    ),
    (
        "nails",
        re.compile(r"\bnails?|manicure|pedicure\b", re.I),
        re.compile(r"nail|manicure|pedicure", re.I),
    ),
    (
        "haircut",
        re.compile(
            r"\b(?:hair\s*cut|haircut|haircuts|trim|"
            r"(?:layer|front|pixie|bob|under|gents?|ladies)\s*cuts?|"
            r"gents?\s*hair\s*cut|ladies\s*hair\s*cut)\b|කට්",
            re.I,
        ),
        re.compile(r"hair\s*cut|haircut|\bcut\b|trim|blade|butterfly|gents|ladies|beard", re.I),
    ),
]

# Live T28 DB category substrings (normalized). Never invent categories.
_CATEGORY_DB_MATCH: dict[str, tuple[str, ...]] = {
    "haircut": ("hair cut",),
    "facial": ("facial",),
    "cleanup": ("facial",),
    "treatment": ("hair treatment",),
    "keratin": ("hair treatment",),
    "straightening": ("hair treatment",),
    "color": ("fashion colour", "grey hair cover"),
    "dressing": ("dressing", "hair setting"),
    "bridal": ("wedding arrangement",),
    "nails": ("nail", "manicure"),
    "waxing": ("waxing",),
    "threading": ("threading",),
    "eyebrow": ("threading", "waxing"),
}

# Singlish / filler tokens — never use for catalogue substring matching
_CATALOGUE_STOP_TOKENS = frozenset(
    {
        "mata", "mta", "oni", "ona", "onai", "ekak", "eka", "kara", "karanna",
        "karaganna", "ganna", "gnn", "please", "want", "need", "like", "have",
        "the", "and", "for", "with", "from", "this", "that", "what", "which",
        "thiyenawada", "thiyenne", "thiyenwad", "kiyada", "kiyanawa", "wedak",
        "puluwan", "puluwanda", "hari", "naha", "nathnam", "nam",
    }
)


def detect_service_category(text: str) -> Optional[str]:
    """Return the service category the customer is asking about (if any)."""
    t_ = _norm(text)
    if not t_:
        return None
    # Prefer more specific intents before generic haircut
    for name, ask_re, _svc_re in _CATEGORY_PATTERNS:
        if ask_re.search(t_):
            return name
    return None


def category_db_names_for_intent(intent: str, services: list[dict]) -> list[str]:
    """Return distinct live DB category names that match an intent key."""
    keys = _CATEGORY_DB_MATCH.get(intent) or ()
    if not keys:
        return []
    found: list[str] = []
    seen: set[str] = set()
    for s in services:
        if not isinstance(s, dict):
            continue
        cat = str(s.get("category") or "").strip()
        if not cat:
            continue
        cn = _norm(cat)
        if any(k in cn for k in keys) and cat not in seen:
            seen.add(cat)
            found.append(cat)
    return found


def is_catalogue_ask(text: str) -> bool:
    """Customer asking what services exist / mond thiyenne / list."""
    t_ = _norm(text)
    if not t_:
        return False
    return bool(_SERVICE_LIST_ASK_RE.search(t_) or re.search(r"\b(?:services?|සේවා)\b", t_))
_GENERIC_HAIRCUT_RE = re.compile(
    r"^\s*(?:i\s+)?(?:want|need|like)?\s*(?:a\s+|an\s+)?(?:hair\s*cut|haircut|cut)\s*"
    r"(?:ekak|eka|one)?\s*(?:karaganna|kara\s*ganna|ganna|oni|ona)?\s*(?:mata|mta)?\s*$"
    r"|^\s*(?:mata|mta)\s*(?:oni|ona)\s*(?:hair\s*cut|haircut|cut)\b"
    r"|\bhair\s*cut\s*(?:ekak|eka)\s*(?:kra|kara)?\s*(?:gnn|ganna)?\s*(?:oni)?\s*(?:mata)?\b",
    re.I,
)


def _pick_by_index_or_name(text: str, items: list[dict], name_key: str = "name") -> Optional[dict]:
    """
    Pick a single item by 1-based index or unique name match (staff, etc.).
    RC7: ONLY pure numeric messages count as list indices — never '11 kiy nne me masene'.
    """
    t_ = _norm(text)
    # Pure "3" / "11" only — embedded numbers are dates/times/corrections
    m = re.search(r"^\s*(\d{1,2})\s*$", t_)
    if m:
        idx = int(m.group(1)) - 1
        if 0 <= idx < len(items):
            return items[idx]
    exact = []
    for it in items:
        name = _norm(str(it.get(name_key) or ""))
        if not name:
            continue
        if name == t_ or name in t_ or (len(t_) >= 4 and t_ in name):
            exact.append(it)
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        # Prefer longest name contained in message (more specific)
        exact.sort(key=lambda it: len(_norm(str(it.get(name_key) or ""))), reverse=True)
        top = _norm(str(exact[0].get(name_key) or ""))
        if top in t_ and not any(
            _norm(str(x.get(name_key) or "")) != top and _norm(str(x.get(name_key) or "")) in t_
            for x in exact[1:]
        ):
            return exact[0]
        return None
    tokens = {w for w in t_.split() if len(w) > 1}
    scored: list[tuple[int, dict]] = []
    for it in items:
        name = _norm(str(it.get(name_key) or ""))
        score = len(tokens & set(name.split()))
        if score > 0:
            scored.append((score, it))
    if not scored:
        return None
    scored.sort(key=lambda x: x[0], reverse=True)
    best = scored[0][0]
    tops = [it for sc, it in scored if sc == best]
    # Ambiguous token ties (e.g. "hair cut" → Baby + Ladies) → no auto-pick
    if len(tops) > 1:
        return None
    return tops[0] if best >= 2 else (tops[0] if best >= 1 and len(items) <= 6 else None)


def _service_blob(s: dict) -> str:
    return _norm(f"{s.get('name') or ''} {s.get('category') or ''} {s.get('description') or ''}")


def _filter_by_db_category(intent: str, services: list[dict]) -> list[dict]:
    """Strict live-DB category boundary — never cross Facials into Hair Cut, etc."""
    keys = _CATEGORY_DB_MATCH.get(intent) or ()
    if not keys:
        return []
    hits: list[dict] = []
    for s in services:
        if not isinstance(s, dict):
            continue
        cat = _norm(str(s.get("category") or ""))
        if any(k in cat for k in keys):
            hits.append(s)
    return hits


def _filter_services_by_message(text: str, services: list[dict]) -> list[dict]:
    """Narrow catalogue to the category the customer ASKED about (treatment ≠ haircut ≠ facial)."""
    t_ = _norm(text)
    if not services:
        return []

    def blob(s: dict) -> str:
        return _service_blob(s)

    category = detect_service_category(text)
    boy = bool(_BOY_RE.search(t_))
    lady = bool(_LADY_RE.search(t_))
    baby = bool(_BABY_RE.search(t_))

    pool = list(services)

    # Category-first via live DB category names — never mix Facials into Hair Cut
    if category:
        db_hits = _filter_by_db_category(category, pool)
        if db_hits:
            pool = db_hits
        else:
            # Fallback: name/pattern match ONLY within non-conflicting rows
            for name, _ask_re, svc_re in _CATEGORY_PATTERNS:
                if name != category:
                    continue
                hits = [s for s in pool if svc_re.search(blob(s))]
                if hits:
                    pool = hits
                break

        # Name refine inside the category boundary
        if category == "cleanup":
            pref = [s for s in pool if re.search(r"clean[\s\-]*up|cleanup", blob(s))]
            return pref  # empty → caller clarifies; never invent
        if category == "keratin":
            pref = [s for s in pool if re.search(r"keratin", blob(s))]
            return pref or [s for s in pool if "hair treatment" in _norm(str(s.get("category") or ""))]
        if category == "straightening":
            pref = [s for s in pool if re.search(r"rebond|relax|straight", blob(s))]
            return pref
        if category == "eyebrow":
            pref = [s for s in pool if re.search(r"eyebrow|brow", blob(s))]
            return pref
        if category in ("facial", "cleanup"):
            # Exclude pure clean-up-only asks already handled; keep Facials rows
            pass

        # Specific style(s) within haircut (layer + butterfly in one message, …)
        if category == "haircut":
            from app.catalogue_quality import mentioned_haircut_styles, resolve_haircut_styles

            if mentioned_haircut_styles(text):
                resolved = resolve_haircut_styles(text, pool)
                # Matched styles only; empty + missing → clarification (never Facials)
                return list(resolved.get("matched") or [])

    if category == "haircut" or (not category and (boy or lady or baby)):
        cat_hits = [
            s
            for s in pool
            if "hair cut" in _norm(str(s.get("category") or ""))
            or (category == "haircut" and re.search(r"\bcut\b", blob(s)))
        ]
        if cat_hits and (category == "haircut" or boy or lady or baby):
            # Prefer true Hair Cut category rows over loose name matches
            strict = [s for s in cat_hits if "hair cut" in _norm(str(s.get("category") or ""))]
            pool = strict or cat_hits

    if baby:
        pref = [s for s in pool if re.search(r"\bbaby|kid|child\b", blob(s))]
        if pref:
            return pref
    if boy:
        pool = [s for s in pool if not re.search(r"\bladies|lady|baby|kid|girl\b", blob(s))]
        pref = [s for s in pool if re.search(r"\bgents?|men|boy|blade|beard\b", blob(s))]
        return pref or pool
    if lady:
        pref = [s for s in pool if re.search(r"\bladies|lady|girl|women\b", blob(s))]
        if pref:
            return pref
        pool = [s for s in pool if not re.search(r"\bbaby|gents?|beard\b", blob(s))]
        return pool

    if category == "haircut" and (
        _GENERIC_HAIRCUT_RE.search(t_)
        or (
            re.search(r"\b(?:hair\s*cut|haircut)\b", t_)
            and not re.search(r"\b(?:baby|ladies|lady|gents?|boy|blade|butterfly)\b", t_)
        )
    ):
        return pool

    return pool


def resolve_catalogue_for_message(
    text: str, services: list[dict]
) -> tuple[Optional[str], list[dict]]:
    """
    Resolve (category_intent, services_to_show) for Gemini / booking.
    When intent is known: ONLY that category (may be empty → ask clarification).
    Never return the full catalogue for a category-specific ask.
    """
    active = [s for s in services if isinstance(s, dict)]
    category = detect_service_category(text)
    if category:
        return category, _filter_services_by_message(text, active)

    t_ = _norm(text)
    tokens = [
        tok
        for tok in re.split(r"[^\w\u0D80-\u0DFF]+", t_)
        if len(tok) >= 3 and tok not in _CATALOGUE_STOP_TOKENS
    ]
    if not tokens:
        return None, []

    matched: list[dict] = []
    for s in active:
        blob = f"{s.get('name') or ''} {s.get('category') or ''}".lower()
        if any(tok in blob for tok in tokens):
            matched.append(s)
    return None, matched


def _format_category_menu(lang: str, services: list[dict]) -> str:
    cats = sorted(
        {
            str(s.get("category") or "").strip()
            for s in services
            if isinstance(s, dict) and str(s.get("category") or "").strip()
        }
    )
    if not cats:
        cats = ["Hair Cut", "Hair Treatment", "Dressing", "Bridal", "Facial", "Nails"]
    listing = "\n".join(f"• {c}" for c in cats[:14])
    if lang == "si":
        return (
            f"අපේ සේවා වර්ග මෙන්න:\n{listing}\n\n"
            "ඔබට ඕන වර්ගය කියන්න (උදා: hair treatment, dressing, hair cut)."
        )
    return (
        f"Here are our service types:\n{listing}\n\n"
        "Tell me which type you want (e.g. hair treatment, dressing, hair cut)."
    )


def _resolve_service_pick(text: str, services: list[dict]) -> tuple[Optional[dict], list[dict]]:
    """
    Returns (picked, candidates_to_show).
    If ambiguous, picked is None and candidates_to_show is the filtered list.
    """
    t_ = _norm(text)
    # Numeric pick against the currently shown full/filtered list
    m = re.search(r"^\s*(\d{1,2})\s*$", t_)
    if m:
        idx = int(m.group(1)) - 1
        if 0 <= idx < len(services):
            return services[idx], services

    # Vague "monda thiyenne" with no category → empty filtered signal (caller shows menu)
    if is_catalogue_ask(text) and not detect_service_category(text) and not re.search(r"^\d{1,2}$", t_):
        return None, []

    filtered = _filter_services_by_message(text, services)
    # Strong unique name match inside filtered (or full) set
    for pool in (filtered, services):
        picked = _pick_by_index_or_name(text, pool)
        if picked:
            return picked, pool

    show = filtered if filtered else services
    category = detect_service_category(text)
    if len(show) > 12 and category:
        show = _filter_services_by_message(text, show) or show
    elif len(show) > 12 and re.search(r"hair\s*cut|haircut|කට්", t_, re.I):
        show = [s for s in show if "hair cut" in _norm(str(s.get("category") or ""))] or show
    return None, show[:12]


_EKATHU_RE = re.compile(
    r"\b(?:ekathu|ekathukarala|ekathu\s*karala|add(?:ing)?|plus|together|combine|combined)\b"
    r"|එකතු|සමඟ",
    re.I,
)


async def _try_add_extra_service(
    tenant_id: int,
    sess: Session,
    message: str,
    actions: list,
) -> bool:
    """
    If customer asks to combine another catalogue service into this visit, append it.
    Returns True when an extra was added (caller should re-list slots with new duration).
    """
    if not _EKATHU_RE.search(str(message or "")):
        return False
    services = await _load_services(tenant_id, sess, force_refresh=False)
    picked, _cands = _resolve_service_pick(message, services)
    if not picked or not picked.get("id"):
        return False
    pid = int(picked["id"])
    if int(sess.draft.service_id or 0) == pid:
        return False
    extras = list(sess.draft.extra_services or [])
    if any(int(x.get("id") or 0) == pid for x in extras if isinstance(x, dict)):
        return False
    extras.append({
        "id": pid,
        "name": picked.get("name"),
        "duration_minutes": int(picked.get("duration_minutes") or 30),
    })
    sess.draft.extra_services = extras
    actions.append({
        "tool": "booking_add_extra_service",
        "ok": True,
        "service_id": pid,
        "name": picked.get("name"),
        "duration_minutes": int(picked.get("duration_minutes") or 30),
        "total_duration": _draft_total_duration(sess.draft),
    })
    return True


async def _auto_assign_staff_ask_date(
    tenant_id: int,
    sess: "Session",
    actions: list,
    do_reset,
    *,
    seed_message: Optional[str] = None,
    customer_name: Optional[str] = None,
) -> dict[str, Any]:
    """Assign first available staff silently — never show staff names to the customer."""
    lang = sess.lang
    staff = await run_tool("list_staff", tenant_id=tenant_id, service_id=sess.draft.service_id) or []
    sess.staff = staff
    actions.append({"tool": "list_staff", "ok": True, "count": len(staff), "auto_assign": True})
    if not staff:
        name = sess.draft.service_name
        do_reset()
        return _reply(t(lang, "no_staff", service=name), actions)
    picked = staff[0]
    sess.draft.staff_id = int(picked["id"])
    sess.draft.staff_name = picked.get("name")  # internal only — never shown in WhatsApp copy
    if picked.get("branch_id"):
        sess.draft.branch_id = int(picked["branch_id"])
    sess.state = AWAIT_DATE
    # "I need haircut booking for tomorrow 8.30am" — consume date/time from seed
    seed = (seed_message or "").strip()
    d = _valid_future_date(_parse_date(seed)) if seed else None
    if not d:
        return _reply(t(lang, "ask_date"), actions)
    sess.draft.date = d
    slots = await _fetch_slots_any_staff(tenant_id, sess, d, actions)
    sess.slots = slots
    if not slots:
        return _reply(t(lang, "no_slots", date=d), actions)
    want_tm = _parse_time(seed)
    if want_tm:
        chosen = _match_slot(want_tm, slots)
        if chosen:
            sess.draft.time = chosen
            actions.append({
                "tool": "date_time_combo",
                "ok": True,
                "date": d,
                "requested": want_tm,
                "slot": chosen,
                "from_seed": True,
            })
            if sess.draft.name or customer_name:
                sess.draft.name = sess.draft.name or customer_name
                sess.state = AWAIT_CONFIRM
                return _reply(_confirm_summary(sess) + "\n\n" + t(lang, "yes_no"), actions)
            sess.state = AWAIT_NAME
            return _reply(t(lang, "ask_name"), actions)
        sess.state = AWAIT_TIME
        sm = getattr(sess, "script_mode", None) or ""
        if sm == "singlish":
            note = f"Hari, *{d}* thiyagaththa. *{want_tm}* free naha — thiyena times:\n"
        elif lang == "si":
            note = f"හරි, *{d}* තියාගත්තා. *{want_tm}* ලබා ගන්න බෑ — තියෙන වේලා:\n"
        else:
            note = f"Got *{d}*. *{want_tm}* isn't free — available times:\n"
        return _reply(note + _times_text(lang, d, slots, draft=sess.draft), actions)
    sess.state = AWAIT_TIME
    return _reply(_times_text(lang, d, slots, draft=sess.draft), actions)


def _wants_service_reselect(text: str, staff: list[dict]) -> bool:
    """True when customer is clarifying service (not picking a stylist)."""
    t_ = _norm(text)
    if not t_:
        return False
    # Already a clear staff pick → not a reselect
    if _pick_by_index_or_name(text, staff or []):
        return False
    if _SERVICE_LIST_ASK_RE.search(t_):
        return True
    if _SERVICE_WORD_RE.search(t_):
        return True
    if _BOY_RE.search(t_) or _LADY_RE.search(t_) or _BABY_RE.search(t_):
        return True
    if re.search(r"\b(?:wrong|change|other|different)\s+service\b|වෙනත්\s*සේවා|සේවාව\s*වෙනස්", t_):
        return True
    return False


def _format_list(items: list[dict], name_key: str = "name", extra_fn=None) -> str:
    lines = []
    for i, it in enumerate(items[:12], 1):
        extra = extra_fn(it) if extra_fn else ""
        lines.append(f"{i}. {it.get(name_key)}{extra}")
    return "\n".join(lines)


async def _load_services(tenant_id: int, sess: Session, *, force_refresh: bool = False) -> list:
    """Load catalogue. force_refresh=True when customer switches category mid-flow."""
    if force_refresh or not sess.services:
        sess.services = await run_tool("list_services", tenant_id=tenant_id) or []
    return sess.services


def _reply(
    text: str,
    actions: list,
    booking: Optional[dict] = None,
    *,
    quick_replies: Optional[list[dict[str, str]]] = None,
) -> dict[str, Any]:
    # Never return empty — customer must always see a WhatsApp reply
    safe = (text or "").strip() or "හරි! *book*, මිල, හෝ hours කියන්න. / Got it — say *book*, prices, or hours."
    out: dict[str, Any] = {"replyText": safe, "actions": actions, "booking": booking}
    if quick_replies:
        out["quickReplies"] = quick_replies[:3]
    return out


def _quick_replies_for_session(sess: Session) -> list[dict[str, str]]:
    """WhatsApp quick-reply button labels (max 3) for the current booking step."""
    lang = sess.lang if sess.lang in ("en", "si", "ta") else "en"
    st = sess.state
    if st == AWAIT_DATE:
        if lang == "si":
            return [{"id": "today", "text": "අද"}, {"id": "tomorrow", "text": "හෙට"}]
        if lang == "ta":
            return [{"id": "today", "text": "இன்று"}, {"id": "tomorrow", "text": "நாளை"}]
        return [{"id": "today", "text": "Today"}, {"id": "tomorrow", "text": "Tomorrow"}]
    if st == AWAIT_TIME:
        buckets = _bucket_slots(sess.slots or [])
        out: list[dict[str, str]] = []
        labels = {
            "morning": {"en": "Morning", "si": "උදේ", "ta": "காலை"},
            "afternoon": {"en": "Afternoon", "si": "දවල්", "ta": "மதியம்"},
            "evening": {"en": "Evening", "si": "සවස", "ta": "மாலை"},
        }
        for key in ("morning", "afternoon", "evening"):
            if buckets.get(key):
                out.append({"id": key, "text": labels[key].get(lang) or labels[key]["en"]})
        return out[:3]
    if st in (AWAIT_CONFIRM, AWAIT_CANCEL_CONFIRM, AWAIT_RESCHED_CONFIRM):
        if lang == "si":
            return [{"id": "yes", "text": "ඔව්"}, {"id": "no", "text": "නැහැ"}]
        if lang == "ta":
            return [{"id": "yes", "text": "ஆம்"}, {"id": "no", "text": "இல்லை"}]
        return [{"id": "yes", "text": "Yes"}, {"id": "no", "text": "No"}]
    if st == AWAIT_SERVICE and sess.services:
        out = []
        for i, s in enumerate(sess.services[:3], 1):
            name = str(s.get("name") or f"Option {i}")[:22]
            out.append({"id": str(i), "text": f"{i}. {name}"})
        return out
    return []


def _attach_flow_state(result: Optional[dict[str, Any]], sess: Session) -> Optional[dict[str, Any]]:
    """Stamp booking SM state + quick replies onto every booking reply."""
    if not result or not isinstance(result, dict):
        return result
    actions = list(result.get("actions") or [])
    if not any(isinstance(a, dict) and a.get("tool") == "booking_flow_state" for a in actions):
        d = sess.draft
        actions.append(
            {
                "tool": "booking_flow_state",
                "ok": True,
                "state": sess.state,
                "paused": bool(getattr(sess, "paused", False)),
                "pause_reason": getattr(sess, "pause_reason", None),
                "service": d.service_name,
                "date": d.date,
                "time": d.time,
            }
        )
        result["actions"] = actions
    result["flowState"] = sess.state
    result["flowPaused"] = bool(getattr(sess, "paused", False))
    # yieldToLlm replies have empty text — skip quick-replies to avoid forcing a step prompt
    if not result.get("yieldToLlm") and not result.get("quickReplies"):
        qr = _quick_replies_for_session(sess)
        if qr:
            result["quickReplies"] = qr
    return result


# ── Entry point ──────────────────────────────────────────────────────────────

async def handle_booking_turn(
    *,
    tenant_id: int,
    conversation_id: Optional[int],
    phone: Optional[str],
    message: str,
    brand: str,
    customer_name: Optional[str] = None,
    faq_with_knowledge: bool = False,
    hint_service: Optional[str] = None,
    recent_messages: Optional[list] = None,
    memory: Optional[dict] = None,
    has_media: bool = False,
) -> Optional[dict[str, Any]]:
    """
    Returns None if message should fall through to LLM chat.
    Else { replyText, actions, booking? }

    `faq_with_knowledge`: caller found knowledge-base context for this message. A clear FAQ
    (hours / location / price) then goes to the LLM/KB instead of entering or advancing a flow.
    `hint_service` / recent chat / memory: when customer says bare "appointment", continue
    the service they were just discussing (e.g. Keratin).
    `has_media`: inbound turn includes image/audio — never treat as a booking step answer.
    """
    key = session_key(tenant_id, conversation_id, phone)
    try:
        sess = get_session(key)
    except BookingSessionUnavailable as exc:
        lang = update_lang("en", message)
        return _reply(
            t(lang, "session_down_1"),
            [{"tool": "booking_session", "ok": False, "error": str(exc)}],
        )
    sess.lang = update_lang(sess.lang, message)
    sess.script_mode = update_script_mode(getattr(sess, "script_mode", None), message)
    resolved_hint = (hint_service or "").strip() or _hint_from_recent_chat(recent_messages, memory)
    script_token = _script_ctx.set(sess.script_mode or "english")

    def do_reset() -> None:
        """
        Clear booking progress in-place (same object identity).

        Critical: never rebind `sess` to a new Session — body + outer must share one object,
        and we always save after the turn so cancel/reschedule start persists.
        """
        lang = sess.lang
        sm = sess.script_mode
        try:
            delete_session(key)
        except BookingSessionUnavailable:
            pass
        sess.state = IDLE
        sess.draft = BookingDraft()
        sess.services = []
        sess.staff = []
        sess.slots = []
        sess.mode = "book"
        sess.lang = lang
        sess.script_mode = sm
        sess.paused = False
        sess.pause_reason = None
        sess.truth = {}
        sess.last_ai_prompt = None

    result: Optional[dict[str, Any]] = None
    try:
        result = await _handle_booking_turn_body(
            sess=sess,
            do_reset=do_reset,
            tenant_id=tenant_id,
            phone=phone,
            message=message,
            brand=brand,
            customer_name=customer_name,
            faq_with_knowledge=faq_with_knowledge,
            hint_service=resolved_hint or None,
            has_media=has_media,
        )
        return _attach_flow_state(result, sess)
    except BookingSessionUnavailable as exc:
        return _reply(
            t(sess.lang, "session_down_2"),
            [{"tool": "booking_session", "ok": False, "error": str(exc)}],
        )
    finally:
        _script_ctx.reset(script_token)
        # Always persist — including after do_reset() followed by cancel/reschedule start.
        try:
            save_session(key, sess)
        except BookingSessionUnavailable:
            pass


def _reprompt_booking_step(sess: Session, actions: list) -> dict[str, Any]:
    """After explicit resume, re-ask the pending step without losing draft."""
    lang = sess.lang
    st = sess.state
    d = sess.draft
    if st == AWAIT_DATE:
        return _reply(t(lang, "ask_date"), actions)
    if st == AWAIT_TIME:
        return _reply(
            _times_text(lang, d.date or "", sess.slots or [], draft=d),
            actions,
        )
    if st == AWAIT_NAME:
        return _reply(t(lang, "ask_name"), actions)
    if st == AWAIT_CONFIRM:
        return _reply(t(lang, "please_confirm"), actions)
    if st == AWAIT_SERVICE:
        listing = ""
        if sess.services:
            lines = []
            for i, s in enumerate(sess.services[:8], 1):
                lines.append(f"{i}. {s.get('name') or 'Service'}")
            listing = "\n".join(lines)
        return _reply(
            t(lang, "svc_prompt", listing=listing or "—"),
            actions,
        )
    if st == AWAIT_CANCEL_CONFIRM and d.target:
        ap = d.target
        return _reply(
            t(lang, "cancel_confirm", id=ap.get("id"), date=ap.get("date"), time=ap.get("time")),
            actions,
        )
    return _reply(
        "Hari — booking eka continue karamu."
        if (getattr(sess, "script_mode", None) == "singlish" or lang == "si")
        else "Okay — let's continue your booking.",
        actions,
    )


async def _handle_booking_turn_body(
    *,
    sess: Session,
    do_reset,
    tenant_id: int,
    phone: Optional[str],
    message: str,
    brand: str,
    customer_name: Optional[str] = None,
    faq_with_knowledge: bool = False,
    hint_service: Optional[str] = None,
    has_media: bool = False,
) -> Optional[dict[str, Any]]:
    lang = sess.lang
    # Keep contextvar in sync if body is entered without outer set
    _script_ctx.set(getattr(sess, "script_mode", None) or "english")
    intent = detect_intent(message, sess)
    actions: list[dict[str, Any]] = []
    actions.append({
        "tool": "comm_style",
        "ok": True,
        "lang": lang,
        "script_mode": getattr(sess, "script_mode", None) or "english",
    })

    if intent == "abort":
        do_reset()
        return _reply(t(lang, "abort"), [{"tool": "booking_abort", "ok": True}])

    media = is_media_message(message, has_media=has_media)
    correction = is_correction_message(message)
    expected = expected_step_for_state(sess.state)

    # ── Latest customer ask wins over pending booking (safe pause) ───────────
    # Idle: corrections / details-before-book / media → Gemini (no pause actions)
    if sess.state == IDLE and (correction or is_details_before_book(message) or media):
        return None

    if sess.state != IDLE:
        # Explicit resume → unpause and either consume step answer or re-prompt
        if is_resume_booking_message(message) and not correction and not media:
            _unpause_booking(sess, actions, reason="explicit_resume")
            if expected and is_clear_step_answer(message, expected=expected):
                pass  # fall through into cancel/book continue handlers
            else:
                return _reprompt_booking_step(sess, actions)

        # While paused: only clear step answers (or cancel/reschedule intent) resume SM
        if sess.paused:
            if intent in ("cancel", "reschedule"):
                _unpause_booking(sess, actions, reason="switch_mode")
            elif expected and is_clear_step_answer(message, expected=expected) and not correction and not media:
                _unpause_booking(sess, actions, reason="step_answer")
            elif (
                is_exact_confirm(message)
                or is_resume_booking_message(message)
            ) and not correction and not media:
                # "Ok" / "Book" / "yes" after Gemini fake-confirm — NEVER yield again
                _unpause_booking(sess, actions, reason="affirm_resume")
                return _reprompt_booking_step(sess, actions)
            else:
                reason = (
                    "media" if media
                    else "correction" if correction
                    else "faq" if is_faq_message(message)
                    else "paused_new_ask"
                )
                _pause_booking(sess, actions, reason)
                return _yield_to_llm(sess, actions)

        # Not paused yet: yield to Gemini unless this is a clear step answer
        # (cancel/reschedule intents still switch modes below)
        if intent not in ("cancel", "reschedule", "abort"):
            # Catalogue re-filter while picking service stays in SM
            if (
                expected == "service"
                and is_catalogue_ask(message)
                and detect_service_category(message)
                and not media
                and not correction
            ):
                pass
            elif media or correction or is_details_before_book(message):
                reason = "media" if media else ("correction" if correction else "details_before_book")
                _pause_booking(sess, actions, reason)
                return _yield_to_llm(sess, actions)
            elif expected and is_side_ask(message, expected=expected):
                reason = (
                    "faq" if is_faq_message(message)
                    else "catalogue_ask" if is_catalogue_ask(message)
                    else "side_ask"
                )
                _pause_booking(sess, actions, reason)
                return _yield_to_llm(sess, actions)
            elif faq_with_knowledge and is_faq_message(message) and sess.state != AWAIT_NAME:
                _pause_booking(sess, actions, "faq_with_knowledge")
                return _yield_to_llm(sess, actions)

    # Idle catalogue ask ("monda thiyenne" / "hair treatment mond") → Gemini + live data
    if intent == "chat" and sess.state == IDLE:
        return None
    if sess.state == IDLE and is_catalogue_ask(message) and not _BOOK_ACTION_RE.search(_norm(message)):
        return None

    # ── Cancel / reschedule: start (also interrupts mid-book) ────────────────
    if intent in ("cancel", "reschedule") and sess.state not in CANCEL_STATES and sess.state not in RESCHED_STATES:
        if sess.state != IDLE:
            do_reset()
        return await _appt_flow_start(
            mode=intent, tenant_id=tenant_id, sess=sess, phone=phone,
            actions=actions, do_reset=do_reset,
            customer_name=customer_name,
        )

    # ── Cancel flow (continue) ───────────────────────────────────────────────
    if sess.state in CANCEL_STATES:
        return await _cancel_continue(tenant_id, sess, message, actions, do_reset)

    # ── Reschedule flow (continue) ───────────────────────────────────────────
    if sess.state in RESCHED_STATES:
        return await _resched_continue(
            tenant_id, sess, phone, message, brand, actions, do_reset
        )

    # ── Combine extra service mid-booking ("X ekathu karanna") ───────────────
    if sess.state in (AWAIT_DATE, AWAIT_TIME, AWAIT_NAME, AWAIT_CONFIRM) and sess.draft.service_id:
        added = await _try_add_extra_service(tenant_id, sess, message, actions)
        if added:
            total = _draft_total_duration(sess.draft)
            # Refresh slots for new total duration when date already chosen
            if sess.draft.date and sess.state in (AWAIT_TIME, AWAIT_CONFIRM, AWAIT_NAME):
                slots = await _fetch_slots_any_staff(tenant_id, sess, str(sess.draft.date), actions)
                sess.slots = slots
                if not slots:
                    sess.state = AWAIT_DATE
                    return _reply(
                        f"Hari — *{_services_label(sess.draft)}* ekathu (total ~{total} min). "
                        f"E duration ekat slots naha — wena date ekak kiyanna."
                        if (getattr(sess, "script_mode", None) == "singlish" or lang == "si")
                        else (
                            f"Added *{_services_label(sess.draft)}* (total ~{total} min). "
                            f"No slots fit that length — try another date?"
                        ),
                        actions,
                    )
                sess.state = AWAIT_TIME
                sess.draft.time = None
                return _reply(
                    (
                        f"Hari — services ekathu una. Total *~{total} min*.\n"
                        if (getattr(sess, "script_mode", None) == "singlish" or lang == "si")
                        else f"Added. Combined total *~{total} min*.\n"
                    )
                    + _times_text(lang, str(sess.draft.date), slots, draft=sess.draft),
                    actions,
                )
            return _reply(
                (
                    f"Hari — *{_services_label(sess.draft)}* ekathu. Total *~{total} min*. "
                    f"Date eka kiyanna."
                    if (getattr(sess, "script_mode", None) == "singlish" or lang == "si")
                    else (
                        f"Added *{_services_label(sess.draft)}*. Total *~{total} min*. "
                        f"What date?"
                    )
                ),
                actions,
            )

    # ── Start book flow ──────────────────────────────────────────────────────
    if intent == "book" and sess.state == IDLE:
        sess.mode = "book"
        sess.draft = BookingDraft(phone=phone, name=customer_name)
        services = await _load_services(tenant_id, sess, force_refresh=True)
        actions.append({"tool": "list_services", "ok": True, "count": len(services)})
        if not services:
            do_reset()
            return _reply(t(lang, "no_services", brand=brand), actions)
        sess.state = AWAIT_SERVICE
        # Bare "book" / "make appointment" → use last discussed service (e.g. Keratin)
        # RC7: NEVER invent Ladies Hair Cut from stale hint when they only gave a date/month.
        msg_has_service = bool(
            detect_service_category(message) or _SERVICE_WORD_RE.search(_norm(message))
        )
        dateish = bool(
            parse_relative_date(message).get("ok")
            or parse_relative_date(message).get("ambiguous")
            or re.search(
                r"\b(?:labana\s+mas|next\s+months?|me\s+mas|booking\s+ek|date|sathiye)\b",
                _norm(message),
            )
        )
        bare_book = bool(
            re.search(
                r"^\s*(?:book|booking|appointment|reserve|yes|ow|hari|ඔව්)\b",
                _norm(message),
            )
        ) and not dateish
        pick_text = message
        if not msg_has_service and hint_service and bare_book:
            pick_text = hint_service  # resolve against discussed service, not the word "appointment"
            actions.append({"tool": "service_hint", "ok": True, "hint": hint_service[:80]})
        elif not msg_has_service and hint_service and dateish:
            actions.append({
                "tool": "service_hint_suppressed",
                "ok": True,
                "reason": "date_without_service",
                "hint_ignored": hint_service[:80],
            })
        picked, candidates = _resolve_service_pick(pick_text, services)
        if not picked and hint_service and pick_text != hint_service:
            picked, candidates = _resolve_service_pick(hint_service, services)
        if picked:
            sess.draft.service_id = int(picked["id"])
            sess.draft.service_name = picked.get("name")
            sess.draft.duration = int(picked.get("duration_minutes") or 30)
            return await _auto_assign_staff_ask_date(
                tenant_id, sess, actions, do_reset,
                seed_message=message, customer_name=customer_name,
            )
        # Real category/filter match only — never dump first N alphabetical services
        real_filter = bool(
            detect_service_category(pick_text) or _SERVICE_WORD_RE.search(_norm(pick_text))
        )
        if real_filter and candidates and len(candidates) < len(services):
            sess.services = candidates
            listing = _format_list(
                candidates,
                extra_fn=lambda s: f" — {s.get('duration_minutes', 30)} min · LKR {s.get('price', 0)}",
            )
            actions.append({
                "tool": "service_clarify",
                "ok": True,
                "count": len(candidates),
                "category": detect_service_category(pick_text),
            })
            return _reply(t(lang, "svc_filtered", listing=listing), actions)
        # No service named yet → ask which one (category menu), do NOT dump random list
        actions.append({"tool": "service_category_menu", "ok": True, "reason": "book_needs_service"})
        ask = (
            "හරි! Appointment එකක් දාමු. ඔබට ඕන සේවාව කුමක්ද?\n"
            + _format_category_menu(lang, services).split("\n\n", 1)[-1]
            if lang == "si"
            else (
                "Sure — let's book an appointment. Which service do you want?\n"
                + _format_category_menu(lang, services).split("\n\n", 1)[-1]
            )
        )
        if hint_service and lang == "si":
            ask = (
                f"හරි! *{hint_service}* සඳහා appointment එකක්ද දාන්නේ? "
                f"ඔව් නම් *yes* කියන්න, නැත්නම් වෙන සේවාවක් කියන්න.\n\n"
                + _format_category_menu(lang, services)
            )
        elif hint_service:
            ask = (
                f"Sure — book *{hint_service}*? Reply *yes*, or tell me another service.\n\n"
                + _format_category_menu(lang, services)
            )
        return _reply(ask, actions)

    if sess.state == AWAIT_SERVICE:
        # Memory recall: "kalin kiwwe dressing ek mokakd" → repeat selected/proposed, no regenerate dump
        if is_memory_recall_ask(message):
            truth = _truth(sess)
            selected = sess.draft.service_name or (truth.selected_service_name.value if truth else None)
            props = sess.services or (truth.proposed_services.value if truth else None) or []
            if selected:
                actions.append({
                    "tool": "conversation_truth_recall",
                    "ok": True,
                    "service_id": sess.draft.service_id,
                    "service": selected,
                })
                return _reply(
                    (
                        f"Mathaka — oya select kala service eka: *{selected}* "
                        f"(~{int(sess.draft.duration or 0)} min). Continue karanna date eka kiyanna."
                        if (getattr(sess, "script_mode", None) == "singlish" or lang == "si")
                        else (
                            f"I remember — you selected *{selected}* "
                            f"(~{int(sess.draft.duration or 0)} min). Send a date to continue."
                        )
                    ),
                    actions,
                )
            if props:
                listing = _format_list(
                    props[:12] if isinstance(props, list) else [],
                    extra_fn=lambda s: f" — {s.get('duration_minutes', 30)} min · LKR {s.get('price', 0)}",
                )
                actions.append({"tool": "conversation_truth_recall", "ok": True, "proposed": True})
                return _reply(
                    (
                        f"Kalin show kala dressing options:\n{listing}\n\nNumber ekak pick karanna."
                        if (getattr(sess, "script_mode", None) == "singlish" or lang == "si")
                        else f"Previously shown options:\n{listing}\n\nReply with a number."
                    ),
                    actions,
                )

        # Short numeric: only list-index when expected service (not date corrections)
        ni = short_numeric_intent(
            message,
            expected_step="service",
            last_ai_question=getattr(sess, "last_ai_prompt", None),
        )
        if ni == "date_day":
            actions.append({"tool": "short_msg_date_not_service", "ok": True})
            return _reply(
                (
                    "E number eka date ekak wage penne — service pick karanna number ekak (list eke), "
                    "nathnam service name eka type karanna."
                    if (getattr(sess, "script_mode", None) == "singlish" or lang == "si")
                    else "That looks like a date — pick a service number from the list, or type the service name."
                ),
                actions,
            )
        if ni == "unclear" and re.match(r"^\s*\d{1,2}\s*$", message or ""):
            actions.append({"tool": "short_msg_clarify", "ok": True})
            return _reply(
                (
                    "Number eka service list index ekada, nathnam date ekada? "
                    "Service nam *3* wage reply karanna; date nam *me mase 11* kiyanna."
                    if (getattr(sess, "script_mode", None) == "singlish" or lang == "si")
                    else "Is that a service list number or a date? Reply *3* for option 3, or *11 this month* for a date."
                ),
                actions,
            )

        # Always resolve against FULL catalogue so "hair treatment" isn't stuck on haircut page
        services = await _load_services(tenant_id, sess, force_refresh=True)
        # If a service is already selected and message is NOT an explicit change, keep it
        if sess.draft.service_id and not is_explicit_service_change(message):
            if not re.match(r"^\s*\d{1,2}\s*$", _norm(message)) and not detect_service_category(message):
                actions.append({
                    "tool": "service_retained",
                    "ok": True,
                    "service_id": sess.draft.service_id,
                    "service": sess.draft.service_name,
                })
                return await _auto_assign_staff_ask_date(
                    tenant_id, sess, actions, do_reset,
                    seed_message=message, customer_name=customer_name,
                )
        picked, candidates = _resolve_service_pick(message, services)
        if not picked:
            if not candidates:
                actions.append({"tool": "service_category_menu", "ok": True})
                return _reply(_format_category_menu(lang, services), actions)
            listing = _format_list(
                candidates,
                extra_fn=lambda s: f" — {s.get('duration_minutes', 30)} min · LKR {s.get('price', 0)}",
            )
            # Remember filtered list order so "1"/"2" match what we showed
            sess.services = candidates
            actions.append({
                "tool": "service_clarify",
                "ok": True,
                "count": len(candidates),
                "category": detect_service_category(message),
            })
            return _reply(t(lang, "svc_filtered", listing=listing), actions)
        # Explicit change vs first select — log correction when replacing
        if sess.draft.service_id and int(picked["id"]) != int(sess.draft.service_id):
            if not is_explicit_service_change(message) and not re.match(r"^\s*\d{1,2}\s*$", _norm(message)):
                actions.append({
                    "tool": "service_change_blocked",
                    "ok": False,
                    "kept": sess.draft.service_name,
                    "attempted": picked.get("name"),
                })
                return _reply(
                    (
                        f"Dæn *{sess.draft.service_name}* select wela thiyenawa. "
                        f"Change karanna oni nam explicitly kiyanna "
                        f"(e.g. *hair cut ekata change karanna*)."
                        if (getattr(sess, "script_mode", None) == "singlish" or lang == "si")
                        else (
                            f"You already selected *{sess.draft.service_name}*. "
                            f"To change, say so clearly (e.g. *change to hair cut*)."
                        )
                    ),
                    actions,
                )
            truth = _truth(sess)
            bump_turn(truth)
            logs = list(truth.service_corrections.value or []) if isinstance(truth.service_corrections.value, list) else []
            logs.append({
                "from_id": sess.draft.service_id,
                "from": sess.draft.service_name,
                "to_id": picked.get("id"),
                "to": picked.get("name"),
                "source": message[:120],
            })
            set_field(truth, "service_corrections", logs[-8:], source=message, confidence=0.95, force=True)
            _save_truth(sess, truth)
        sess.draft.service_id = int(picked["id"])
        sess.draft.service_name = picked.get("name")
        # Authoritative catalogue duration — never invent 30 for a 120-min service
        sess.draft.duration = max(15, int(picked.get("duration_minutes") or 30))
        _sync_truth_from_draft(sess, source=message)
        sess.last_ai_prompt = "date"
        return await _auto_assign_staff_ask_date(
            tenant_id, sess, actions, do_reset,
            seed_message=message, customer_name=customer_name,
        )

    if sess.state == AWAIT_STAFF:
        # Customer clarifying service (boy hair cut / what hair cut services) → back to service pick
        if _wants_service_reselect(message, sess.staff or []):
            services = await _load_services(tenant_id, sess)
            # Reload full catalogue for re-filter (sess.services may be a short filtered page)
            try:
                sess.services = await run_tool("list_services", tenant_id=tenant_id) or services
            except Exception:
                pass
            services = sess.services or services
            sess.draft.service_id = None
            sess.draft.service_name = None
            sess.draft.staff_id = None
            sess.draft.staff_name = None
            sess.staff = []
            sess.state = AWAIT_SERVICE
            picked, candidates = _resolve_service_pick(message, services)
            if not picked:
                listing = _format_list(
                    candidates,
                    extra_fn=lambda s: f" — {s.get('duration_minutes', 30)} min · LKR {s.get('price', 0)}",
                )
                sess.services = candidates
                actions.append({"tool": "service_reselect", "ok": True, "count": len(candidates)})
                return _reply(t(lang, "svc_filtered", listing=listing), actions)
            sess.draft.service_id = int(picked["id"])
            sess.draft.service_name = picked.get("name")
            sess.draft.duration = int(picked.get("duration_minutes") or 30)
            return await _auto_assign_staff_ask_date(
                tenant_id, sess, actions, do_reset,
                seed_message=message, customer_name=customer_name,
            )
        # Never show staff list — auto-assign and ask for date
        return await _auto_assign_staff_ask_date(
            tenant_id, sess, actions, do_reset,
            seed_message=message, customer_name=customer_name,
        )

    if sess.state == AWAIT_DATE:
        # Short "11 kiy nne me masene" → date correction, NEVER additional service
        ni = short_numeric_intent(
            message,
            expected_step="date",
            last_ai_question=getattr(sess, "last_ai_prompt", None) or "date",
        )
        if ni == "list_index" and sess.draft.service_id:
            actions.append({"tool": "numeric_kept_as_date_context", "ok": True})
        _parse_date.last_clarify = None  # type: ignore[attr-defined]
        parsed = _parse_date(message)
        d = _valid_future_date(parsed)
        if not d:
            clarify = getattr(_parse_date, "last_clarify", None)
            if clarify:
                actions.append({"tool": "date_clarify", "ok": True, "reason": "ambiguous_relative"})
                return _reply(str(clarify), actions)
            return _reply(t(lang, "bad_date"), actions)
        # Weekday consistency: if message named a weekday, resolved date must match
        for i, (pat, native) in enumerate(_WEEKDAYS):
            singlish = {
                5: r"senasurada|senasura|sani|sathiye|sathiya|sathida",
            }.get(i, "")
            hit = (
                re.search(rf"\b(?:{pat})\b", _norm(message))
                or any(n in _norm(message) for n in native)
                or (singlish and re.search(rf"\b(?:{singlish})\b", _norm(message)))
            )
            if hit:
                try:
                    if date.fromisoformat(d).weekday() != i:
                        actions.append({
                            "tool": "date_weekday_mismatch",
                            "ok": False,
                            "date": d,
                            "expected_weekday": i,
                        })
                        return _reply(
                            (
                                f"E date eka (*{d}*) e weekday ekata match wenne naha. "
                                f"Exact date ekak Clarification ekak denna."
                                if (getattr(sess, "script_mode", None) == "singlish" or lang == "si")
                                else (
                                    f"*{d}* does not fall on that weekday. "
                                    f"Please send the exact calendar date."
                                )
                            ),
                            actions,
                        )
                except ValueError:
                    pass
                break
        # Preflight: service id + catalogue duration before availability
        pre = validate_booking_preflight(
            service_id=sess.draft.service_id,
            duration_minutes=sess.draft.duration,
            preferred_date=d,
            catalogue_duration=sess.draft.duration,
        )
        actions.append({"tool": "booking_preflight", "ok": pre["ok"], **pre})
        if not pre["ok"] and "missing_service_id" in (pre.get("errors") or []):
            sess.state = AWAIT_SERVICE
            return _reply(
                (
                    "Service eka select karanna issella date eka fix karanna bari. "
                    "Mokakda service eka?"
                    if (getattr(sess, "script_mode", None) == "singlish" or lang == "si")
                    else "Please choose the service first, then the date."
                ),
                actions,
            )
        sess.draft.date = d
        _sync_truth_from_draft(sess, source=message)
        slots = await _fetch_slots_any_staff(tenant_id, sess, d, actions)
        sess.slots = slots
        if not slots:
            sess.state = AWAIT_DATE
            return _reply(t(lang, "no_slots", date=d), actions)
        # Realistic: "Heta 10 am" / "tomorrow 3pm" → take date + time in one message
        want_tm = _parse_time(message)
        if want_tm:
            chosen = _match_slot(want_tm, slots)
            if chosen:
                sess.draft.time = chosen
                actions.append({
                    "tool": "date_time_combo",
                    "ok": True,
                    "date": d,
                    "requested": want_tm,
                    "slot": chosen,
                })
                if sess.draft.name or customer_name:
                    sess.draft.name = sess.draft.name or customer_name
                    sess.state = AWAIT_CONFIRM
                    return _reply(_confirm_summary(sess) + "\n\n" + t(lang, "yes_no"), actions)
                sess.state = AWAIT_NAME
                return _reply(t(lang, "ask_name"), actions)
            # Date ok but that clock time unavailable — show open slots
            sess.state = AWAIT_TIME
            sm = getattr(sess, "script_mode", None) or ""
            if sm == "singlish":
                note = f"Hari, *{d}* thiyagaththa. *{want_tm}* free naha — thiyena times:\n"
            elif lang == "si":
                note = f"හරි, *{d}* තියාගත්තා. *{want_tm}* ලබා ගන්න බෑ — තියෙන වේලා:\n"
            else:
                note = f"Got *{d}*. *{want_tm}* isn't free — available times:\n"
            return _reply(note + _times_text(lang, d, slots, draft=sess.draft), actions)
        sess.state = AWAIT_TIME
        return _reply(_times_text(lang, d, slots, draft=sess.draft), actions)

    if sess.state == AWAIT_TIME:
        # "mage time slots / wada 3 ma" → re-list calculated start→end times
        if _is_slot_list_ask(message) and not _parse_time(message) and not _is_period_only_message(message):
            band = _period_band_from_message(message)
            actions.append({
                "tool": "slot_list_ask",
                "ok": True,
                "duration_minutes": _draft_total_duration(sess.draft),
                "services": len(_draft_services_list(sess.draft)),
                "period": band,
            })
            return _reply(
                _times_text(
                    lang,
                    str(sess.draft.date or ""),
                    sess.slots or [],
                    draft=sess.draft,
                    period=band,
                ),
                actions,
            )
        # "Afternoon" alone → show that band with start→end (do NOT auto-pick / invent range)
        if _is_period_only_message(message):
            band = _period_band_from_message(message) or "afternoon"
            buckets = _bucket_slots(sess.slots or [])
            band_slots = buckets.get(band) or []
            if not band_slots:
                return _reply(
                    t(lang, "bad_time", options=", ".join((sess.slots or [])[:10])),
                    actions,
                )
            actions.append({
                "tool": "period_slot_list",
                "ok": True,
                "period": band,
                "count": len(band_slots),
                "duration_minutes": _draft_total_duration(sess.draft),
            })
            return _reply(
                _times_text(lang, str(sess.draft.date or ""), sess.slots or [], draft=sess.draft, period=band),
                actions,
            )
        tm = _parse_time(message)
        if not tm:
            tm = _pick_period_slot(message, sess.slots or [])
        if not tm:
            return _reply(
                _times_text(lang, str(sess.draft.date or ""), sess.slots or [], draft=sess.draft)
                if sess.slots
                else t(lang, "bad_time", options=", ".join((sess.slots or [])[:10])),
                actions,
            )
        matched = _match_slot(tm, sess.slots or []) if sess.slots else tm
        if sess.slots and not matched:
            return _reply(
                t(lang, "slot_taken", options=", ".join(sess.slots[:12]))
                + "\n\n"
                + _times_text(lang, str(sess.draft.date or ""), sess.slots or [], draft=sess.draft),
                actions,
            )
        sess.draft.time = matched or tm
        if sess.draft.name or customer_name:
            sess.draft.name = sess.draft.name or customer_name
            sess.state = AWAIT_CONFIRM
            return _reply(_confirm_summary(sess) + "\n\n" + t(lang, "yes_no"), actions)
        sess.state = AWAIT_NAME
        return _reply(t(lang, "ask_name"), actions)

    if sess.state == AWAIT_NAME:
        name = message.strip()
        if len(name) < 2:
            return _reply(t(lang, "ask_name_short"), actions)
        sess.draft.name = name
        sess.state = AWAIT_CONFIRM
        return _reply(_confirm_summary(sess) + "\n\n" + t(lang, "yes_no"), actions)

    if sess.state == AWAIT_CONFIRM:
        if is_exact_decline(message):
            do_reset()
            return _reply(t(lang, "draft_cancelled"), actions)
        if not is_exact_confirm(message):
            return _reply(t(lang, "yes_no_redo") + "\n" + _confirm_summary(sess), actions)
        if not phone:
            do_reset()
            return _reply(t(lang, "no_phone"), actions)

        d = sess.draft
        # Double-booking prevention: re-check live slots before create
        try:
            fresh_slots = await _fetch_slots_any_staff(tenant_id, sess, str(d.date), actions)
            still_ok = _match_slot(str(d.time), fresh_slots or []) if fresh_slots else None
            if fresh_slots is not None and not still_ok:
                sess.slots = fresh_slots
                sess.state = AWAIT_TIME
                actions.append({"tool": "slot_recheck", "ok": False, "time": d.time})
                return _reply(
                    t(lang, "slot_recheck_fail", options=", ".join((fresh_slots or [])[:12]) or "—"),
                    actions,
                )
            actions.append({"tool": "slot_recheck", "ok": True, "time": d.time})
        except Exception as exc:
            actions.append({"tool": "slot_recheck", "ok": False, "error": str(exc)})
            # Fail closed on availability errors — do not claim booked
            return _reply(t(lang, "book_fail", err=exc), actions, {
                "status": "failed",
                "retryable": True,
                "error": f"slot_recheck:{exc}",
            })

        idem = f"wa:{tenant_id}:{phone}:{d.service_id}:{d.staff_id}:{d.date}:{d.time}"
        payload = {
            "service_id": d.service_id,
            "staff_id": d.staff_id,
            "date": d.date,
            "time": d.time,
            "customer_name": d.name,
            "phone": phone,
            "branch_id": d.branch_id,
            "idempotency_key": idem,
            "notes": (
                f"Booked via WhatsApp AI CRM. "
                f"Services: {_services_label(d)}. "
                f"Duration ~{_draft_total_duration(d)} min "
                f"({d.time}→{_end_hhmm(str(d.time or ''), _draft_total_duration(d))})."
            ),
        }
        try:
            result = await run_tool("book_appointment", tenant_id=tenant_id, **payload)
            actions.append({"tool": "book_appointment", "ok": True, "idempotency_key": idem})
        except Exception as exc:
            actions.append({"tool": "book_appointment", "ok": False, "error": str(exc), "idempotency_key": idem})
            return _reply(
                t(lang, "book_fail", err=exc),
                actions,
                {
                    "status": "failed",
                    "retryable": True,
                    "payload": payload,
                    "idempotency_key": idem,
                    "error": str(exc),
                },
            )

        appt = result.get("appointment") if isinstance(result, dict) else None
        if not isinstance(appt, dict) or not appt.get("id"):
            actions.append({"tool": "book_appointment", "ok": False, "error": "no_appointment_in_result"})
            return _reply(
                t(lang, "book_fail_noappt"),
                actions,
                {
                    "status": "failed",
                    "retryable": True,
                    "payload": payload,
                    "idempotency_key": idem,
                    "error": "no_appointment_in_result",
                    "result": result,
                },
            )
        ref = appt.get("id")
        reply = t(
            lang, "booked",
            service=d.service_name, date=d.date, time=d.time, brand=brand, ref=ref,
        )
        do_reset()
        return _reply(
            reply,
            actions,
            {
                "status": "confirmed",
                "salon_appointment_id": ref,
                "payload": payload,
                "idempotency_key": idem,
                "result": result,
            },
        )

    return None


async def _fetch_slots_any_staff(
    tenant_id: int,
    sess: Session,
    d: str,
    actions: list,
) -> list:
    """Try assigned staff first, then other staff silently — never name them to the customer."""
    staff_list = list(sess.staff or [])
    if not staff_list and sess.draft.service_id:
        try:
            staff_list = await run_tool(
                "list_staff", tenant_id=tenant_id, service_id=sess.draft.service_id
            ) or []
            sess.staff = staff_list
        except Exception as exc:
            actions.append({"tool": "list_staff", "ok": False, "error": str(exc)[:120]})
            staff_list = []

    ordered: list[dict] = []
    seen: set[int] = set()
    if sess.draft.staff_id:
        for s in staff_list:
            if int(s.get("id") or 0) == int(sess.draft.staff_id):
                ordered.append(s)
                seen.add(int(s["id"]))
                break
    for s in staff_list:
        sid = int(s.get("id") or 0)
        if sid and sid not in seen:
            ordered.append(s)
            seen.add(sid)

    duration = _draft_total_duration(sess.draft)
    # RC7: never probe availability with a silent 30-min default when catalogue says longer
    if sess.draft.service_id and int(sess.draft.duration or 0) >= 15:
        duration = max(duration, int(sess.draft.duration))
    actions.append({
        "tool": "availability_duration_guard",
        "ok": True,
        "service_id": sess.draft.service_id,
        "service": sess.draft.service_name,
        "duration_minutes": duration,
        "date": d,
    })
    truth = _truth(sess)
    set_field(truth, "service_duration", duration, source="availability", confidence=0.95, confirmed=True)
    set_field(
        truth,
        "availability_result",
        {"date": d, "duration_minutes": duration},
        source="availability",
        confidence=0.7,
    )
    _save_truth(sess, truth)
    for s in ordered:
        sid = int(s.get("id") or 0)
        if not sid:
            continue
        slots = await _fetch_slots(tenant_id, sid, d, duration)
        if slots:
            sess.draft.staff_id = sid
            sess.draft.staff_name = s.get("name")
            if s.get("branch_id"):
                sess.draft.branch_id = int(s["branch_id"])
            actions.append(
                {
                    "tool": "check_availability",
                    "ok": True,
                    "count": len(slots),
                    "staff_rotated": True,
                    "duration_minutes": duration,
                    "services": len(_draft_services_list(sess.draft)),
                }
            )
            return slots
    actions.append({"tool": "check_availability", "ok": True, "count": 0, "duration_minutes": duration})
    return []


async def _fetch_slots(tenant_id: int, staff_id: Optional[int], d: str, duration: int) -> list:
    avail = await run_tool(
        "check_availability",
        tenant_id=tenant_id,
        staff_id=staff_id,
        date=d,
        duration=duration,
    )
    slots = avail.get("slots") if isinstance(avail, dict) else avail
    return slots or []


def _bucket_slots(slots: list[str]) -> dict[str, list[str]]:
    """Group HH:MM slots into morning / afternoon / evening for clearer WhatsApp UX."""
    buckets: dict[str, list[str]] = {"morning": [], "afternoon": [], "evening": []}
    for raw in slots:
        s = str(raw or "").strip()[:5]
        try:
            hh = int(s.split(":")[0])
        except Exception:
            continue
        if hh < 12:
            buckets["morning"].append(s)
        elif hh < 17:
            buckets["afternoon"].append(s)
        else:
            buckets["evening"].append(s)
    return buckets


def _duration_line(lang: str, draft: BookingDraft) -> str:
    total = _draft_total_duration(draft)
    services = _draft_services_list(draft)
    label = _services_label(draft)
    sm = ""
    try:
        sm = _script_ctx.get() or ""
    except Exception:
        sm = ""
    if len(services) > 1:
        parts = ", ".join(
            f"{s.get('name')} {int(s.get('duration_minutes') or 0)}m" for s in services
        )
        if sm == "singlish":
            return f"Okkom ekathu: *{label}* — full time *~{total} min* ({parts}).\n"
        if lang == "si":
            return f"සේවා එකතුව: *{label}* → මුළු කාලය *~{total} min* ({parts}).\n"
        if lang == "ta":
            return f"சேவைகள்: *{label}* → மொத்தம் *~{total} min* ({parts}).\n"
        return f"Together: *{label}* — about *~{total} min* ({parts}).\n"
    if sm == "singlish":
        return f"*{label}* ekat *~{total} min* yai.\n"
    if lang == "si":
        return f"*{label}* — මුළු කාලය *~{total} min*.\n"
    if lang == "ta":
        return f"*{label}* — மொத்தம் *~{total} min*.\n"
    return f"*{label}* — total *~{total} min*.\n"


def _example_end_line(lang: str, slots: list, duration: int) -> str:
    if not slots:
        return ""
    start = str(slots[0])[:5]
    end = _end_hhmm(start, duration)
    sm = ""
    try:
        sm = _script_ctx.get() or ""
    except Exception:
        sm = ""
    if sm == "singlish":
        return f"Ehemada: *{start}* indan start unoth ~{duration} min yai — *{end}* withara iwara.\n"
    if lang == "si":
        return f"උදාහරණය: *{start}* ආරම්භය → *{end}* අවසානය (~{duration} min).\n"
    if lang == "ta":
        return f"உதா: *{start}* தொடக்கம் → *{end}* முடிவு (~{duration} min).\n"
    return f"Example: start *{start}* → finish *{end}* (~{duration} min).\n"


def _times_text(
    lang: str,
    d: str,
    slots: list,
    *,
    draft: Optional[BookingDraft] = None,
    period: Optional[str] = None,
) -> str:
    duration = _draft_total_duration(draft) if draft else 30
    duration_line = _duration_line(lang, draft) if draft else f"Total *~{duration} min*.\n"
    buckets = _bucket_slots(slots)
    labels = {
        "morning": {"en": "Morning", "si": "උදේ", "ta": "காலை", "sg": "ude"},
        "afternoon": {"en": "Afternoon", "si": "දවල්", "ta": "மதியம்", "sg": "dawal"},
        "evening": {"en": "Evening", "si": "සවස", "ta": "மாலை", "sg": "sawasa"},
    }
    lines: list[str] = []
    keys = (period,) if period in buckets else ("morning", "afternoon", "evening")
    for key in keys:
        if not key:
            continue
        group = buckets.get(key) or []
        if not group:
            continue
        # Show start→end for first few so customer sees real length
        show_bits = [f"{s}→{_end_hhmm(s, duration)}" for s in group[:4]]
        extra = f" (+{len(group) - 4})" if len(group) > 4 else ""
        sm = ""
        try:
            sm = _script_ctx.get() or ""
        except Exception:
            sm = ""
        lab = labels[key].get("sg" if sm == "singlish" else lang) or labels[key]["en"]
        lines.append(f"*{lab}:* {', '.join(show_bits)}{extra}")
    shown = "\n".join(lines) if lines else ", ".join(
        f"{str(s)[:5]}→{_end_hhmm(str(s)[:5], duration)}" for s in slots[:8]
    )
    more = ""
    if not lines and len(slots) > 8:
        more = f" (+{len(slots) - 8} more)"
    example_line = _example_end_line(lang, list(buckets.get(period) or slots), duration) if period else _example_end_line(lang, slots, duration)
    if period:
        lab = labels.get(period, {}).get(lang) or period
        return t(
            lang,
            "times_period",
            date=d,
            period=lab,
            shown=shown or "—",
            more=more,
            duration_line=duration_line,
            example_line=example_line,
        )
    return t(
        lang,
        "times",
        date=d,
        shown=shown or "—",
        more=more,
        duration_line=duration_line,
        example_line=example_line,
    )


def _pick_period_slot(message: str, slots: list[str]) -> Optional[str]:
    """If customer says morning/afternoon/evening, pick first free slot in that band."""
    t_ = _norm(message)
    buckets = _bucket_slots(slots)
    # Prefer explicit clock inside the period phrase when present
    clock = _parse_time(message)
    if clock:
        matched = _match_slot(clock, slots)
        if matched:
            return matched
    if re.search(r"\bmorning\b|\bude\b|\budeta\b|උදේ|காலை", t_):
        return (buckets["morning"] or [None])[0]
    if re.search(r"\bafternoon\b|\bdawal\b|දවල්|மதியம்|lunch", t_):
        return (buckets["afternoon"] or [None])[0]
    if re.search(r"\bevening\b|\bsawasa\b|සවස|රෑ|மாலை|night", t_):
        return (buckets["evening"] or [None])[0]
    return None


def _confirm_summary(sess: Session) -> str:
    d, lang = sess.draft, sess.lang
    total = _draft_total_duration(d)
    end = _end_hhmm(str(d.time or ""), total) if d.time else "—"
    when = f"{d.date} {d.time} → {end} (~{total} min)"
    return (
        f"{t(lang, 'please_confirm')}\n"
        f"• {t(lang, 'lbl_service')}: {_services_label(d)}\n"
        f"• {t(lang, 'lbl_when')}: {when}\n"
        f"• {t(lang, 'lbl_duration')}: ~{total} min\n"
        f"• {t(lang, 'lbl_name')}: {d.name}"
    )


# ── Cancel / reschedule: shared start + pick ─────────────────────────────────

def _slim_appt(a: dict, service_names: Optional[dict] = None) -> dict:
    sid = a.get("service_id")
    sname = (
        a.get("service_name")
        or a.get("serviceName")
        or (service_names or {}).get(str(sid) if sid is not None else "")
        or (service_names or {}).get(sid)
    )
    return {
        "id": int(a["id"]),
        "date": str(a.get("date") or "")[:10],
        "time": str(a.get("time") or "")[:5],
        "status": a.get("status"),
        "staff_id": a.get("staff_id"),
        "service_id": a.get("service_id"),
        "branch_id": a.get("branch_id"),
        "customer_name": a.get("customer_name") or a.get("customerName"),
        "service_name": sname,
    }


def _appt_lines(rows: list[dict]) -> str:
    lines = []
    for i, a in enumerate(rows[:8], 1):
        svc = f" — {a['service_name']}" if a.get("service_name") else ""
        lines.append(f"{i}. #{a['id']}{svc} — {a['date']} {a['time']} ({a.get('status')})")
    return "\n".join(lines)


def _pick_appt(message: str, cands: list[dict]) -> Optional[dict]:
    """'#123' selects by appointment id; a bare 1-2 digit number selects by list position."""
    m = re.search(r"#\s*(\d+)", message)
    if m:
        want = int(m.group(1))
        return next((c for c in cands if int(c["id"]) == want), None)
    m = re.search(r"\b(\d{1,2})\b", message)
    if not m:
        return None
    idx = int(m.group(1)) - 1
    return cands[idx] if 0 <= idx < len(cands) else None


async def _identify_customer(
    tenant_id: int, phone: Optional[str], actions: list, fallback_name: Optional[str] = None,
) -> Optional[str]:
    """Resolve known salon customer from WhatsApp phone (prior customer)."""
    if not phone:
        return (fallback_name or "").strip() or None
    try:
        lookup = await run_tool("customer_lookup", tenant_id=tenant_id, phone=phone) or {}
        exists = bool(lookup.get("exists") and lookup.get("customer"))
        actions.append({"tool": "customer_lookup", "ok": True, "exists": exists})
        if exists:
            name = (lookup["customer"].get("name") or "").strip()
            if name:
                return name
    except Exception as exc:
        actions.append({"tool": "customer_lookup", "ok": False, "error": str(exc)})
    return (fallback_name or "").strip() or None


async def _appt_flow_start(
    *, mode: str, tenant_id: int, sess: Session, phone: Optional[str],
    actions: list, do_reset, customer_name: Optional[str] = None,
) -> dict[str, Any]:
    lang = sess.lang
    sess.mode = mode
    if not phone:
        do_reset()
        return _reply(t(lang, "need_phone"), actions)

    # Identify prior customer on this WhatsApp number before listing appointments
    known_name = await _identify_customer(tenant_id, phone, actions, customer_name)

    try:
        rows = await run_tool("list_appointments", tenant_id=tenant_id, phone=phone) or []
        actions.append({"tool": "list_appointments", "ok": True, "count": len(rows)})
    except Exception as exc:
        actions.append({"tool": "list_appointments", "ok": False, "error": str(exc)})
        do_reset()
        return _reply(t(lang, "appts_load_fail"), actions)

    service_names: dict = {}
    try:
        services = await run_tool("list_services", tenant_id=tenant_id) or []
        for s in services:
            if isinstance(s, dict) and s.get("id") is not None:
                service_names[str(s["id"])] = s.get("name")
                service_names[s["id"]] = s.get("name")
    except Exception as exc:
        actions.append({"tool": "list_services", "ok": False, "error": str(exc)})

    cands = [
        _slim_appt(a, service_names) for a in rows if isinstance(a, dict) and a.get("id")
    ][:8]
    if not known_name and cands:
        known_name = (cands[0].get("customer_name") or "").strip() or None

    if not cands:
        do_reset()
        if known_name:
            return _reply(t(lang, "no_appts_named", name=known_name), actions)
        return _reply(t(lang, "no_appts"), actions)

    sess.draft = BookingDraft(phone=phone, name=known_name, cancel_candidates=cands)
    if len(cands) == 1:
        return await _appt_selected(tenant_id, sess, cands[0], actions, do_reset)
    if mode == "cancel":
        sess.state = AWAIT_CANCEL_PICK
        if known_name:
            return _reply(
                t(lang, "cancel_pick_named", name=known_name, lines=_appt_lines(cands)),
                actions,
            )
        return _reply(t(lang, "cancel_pick", lines=_appt_lines(cands)), actions)
    sess.state = AWAIT_RESCHED_PICK
    return _reply(t(lang, "resched_pick", lines=_appt_lines(cands)), actions)


async def _appt_selected(
    tenant_id: int, sess: Session, appt: dict, actions: list, do_reset,
) -> dict[str, Any]:
    lang = sess.lang
    sess.draft.target = appt
    if sess.mode == "cancel":
        sess.state = AWAIT_CANCEL_CONFIRM
        known = (sess.draft.name or appt.get("customer_name") or "").strip()
        if known:
            return _reply(
                t(
                    lang,
                    "cancel_confirm_named",
                    name=known,
                    id=appt["id"],
                    date=appt["date"],
                    time=appt["time"],
                ),
                actions,
            )
        return _reply(
            t(lang, "cancel_confirm", id=appt["id"], date=appt["date"], time=appt["time"]),
            actions,
        )

    # reschedule: same staff + service duration, so availability is checked against the right calendar
    if not appt.get("staff_id"):
        do_reset()
        return _reply(t(lang, "resched_no_staff"), actions)
    d = sess.draft
    d.service_id = int(appt["service_id"]) if appt.get("service_id") else None
    d.staff_id = int(appt["staff_id"])
    d.branch_id = int(appt["branch_id"]) if appt.get("branch_id") else None
    d.duration = 30
    try:
        services = await _load_services(tenant_id, sess)
        svc = next((s for s in services if str(s.get("id")) == str(appt.get("service_id"))), None)
        if svc:
            d.service_name = svc.get("name")
            d.duration = int(svc.get("duration_minutes") or 30)
    except Exception as exc:
        actions.append({"tool": "list_services", "ok": False, "error": str(exc)})
    try:
        staff = await run_tool("list_staff", tenant_id=tenant_id, service_id=d.service_id) or []
        member = next((s for s in staff if str(s.get("id")) == str(appt.get("staff_id"))), None)
        d.staff_name = (member or {}).get("name")
    except Exception as exc:
        actions.append({"tool": "list_staff", "ok": False, "error": str(exc)})
    sess.state = AWAIT_RESCHED_DATE
    return _reply(
        t(lang, "resched_ask_date", id=appt["id"], date=appt["date"], time=appt["time"]),
        actions,
    )


# ── Cancel (explicit confirm required) ───────────────────────────────────────

async def _cancel_continue(
    tenant_id: int, sess: Session, message: str, actions: list, do_reset,
) -> dict[str, Any]:
    lang = sess.lang
    cands = sess.draft.cancel_candidates

    if sess.state == AWAIT_CANCEL_PICK:
        if not re.search(r"\d", message):
            return _reply(t(lang, "pick_number"), actions)
        appt = _pick_appt(message, cands)
        if not appt:
            return _reply(t(lang, "bad_number"), actions)
        return await _appt_selected(tenant_id, sess, appt, actions, do_reset)

    # AWAIT_CANCEL_CONFIRM — never cancel without an exact yes
    appt = sess.draft.target
    if not appt:
        do_reset()
        return _reply(t(lang, "appts_load_fail"), actions)
    if _is_decline_keep(message):
        do_reset()
        return _reply(t(lang, "cancel_kept", id=appt["id"]), actions)
    if not is_exact_confirm(message):
        return _reply(t(lang, "cancel_confirm_redo", id=appt["id"]), actions)
    appt_id = int(appt["id"])
    try:
        result = await run_tool(
            "cancel_appointment", tenant_id=tenant_id, appointment_id=appt_id, reason="customer_whatsapp"
        )
    except Exception as exc:
        actions.append({"tool": "cancel_appointment", "ok": False, "error": str(exc)})
        # Keep cancel-confirm state so customer can retry with *yes*
        return _reply(t(lang, "cancel_fail", err=exc), actions)

    verified = _cancel_result_verified(result)
    if not verified:
        actions.append(
            {
                "tool": "cancel_appointment",
                "ok": False,
                "error": "unverified_cancel",
                "result": result if isinstance(result, dict) else {"raw": str(result)[:200]},
            }
        )
        return _reply(
            t(lang, "cancel_fail", err="system did not confirm cancel"),
            actions,
        )

    actions.append({"tool": "cancel_appointment", "ok": True, "verified": True})
    reply = t(lang, "cancelled", id=appt_id, date=appt["date"], time=appt["time"])
    do_reset()
    return _reply(
        reply, actions, {"status": "cancelled", "salon_appointment_id": appt_id, "result": result}
    )


def _cancel_result_verified(result: Any) -> bool:
    """Never tell the customer cancel succeeded without backend confirmation."""
    if not isinstance(result, dict):
        return False
    if result.get("already_cancelled"):
        return True
    appt = result.get("appointment")
    if isinstance(appt, dict):
        status = str(appt.get("status") or "").lower()
        if status == "cancelled":
            return True
        # Some APIs return the updated row without status key — require explicit cancelled
        return False
    return False


# ── Reschedule ───────────────────────────────────────────────────────────────

def _resched_summary(sess: Session) -> str:
    d, lang = sess.draft, sess.lang
    appt = d.target or {}
    label = f" ({d.service_name})" if d.service_name else ""
    lines = [
        t(lang, "please_confirm_resched"),
        f"• {t(lang, 'lbl_appt')}: #{appt.get('id')}{label}",
        f"• {t(lang, 'lbl_from')}: {appt.get('date')} {appt.get('time')}",
        f"• {t(lang, 'lbl_to')}: {d.date} {d.time}",
    ]
    return "\n".join(lines)


def _http_status(exc: Exception) -> Optional[int]:
    resp = getattr(exc, "response", None)
    return getattr(resp, "status_code", None)


async def _resched_continue(
    tenant_id: int, sess: Session, phone: Optional[str], message: str, brand: str,
    actions: list, do_reset,
) -> dict[str, Any]:
    lang = sess.lang
    d = sess.draft

    if sess.state == AWAIT_RESCHED_PICK:
        if not re.search(r"\d", message):
            return _reply(t(lang, "pick_number"), actions)
        appt = _pick_appt(message, d.cancel_candidates)
        if not appt:
            return _reply(t(lang, "bad_number"), actions)
        return await _appt_selected(tenant_id, sess, appt, actions, do_reset)

    appt = d.target
    if not appt or not d.staff_id:
        do_reset()
        return _reply(t(lang, "resched_no_staff"), actions)

    if sess.state == AWAIT_RESCHED_DATE:
        nd = _valid_future_date(_parse_date(message))
        if not nd:
            return _reply(t(lang, "bad_date"), actions)
        d.date = nd
        try:
            slots = await _fetch_slots(tenant_id, d.staff_id, nd, d.duration)
        except Exception as exc:
            actions.append({"tool": "check_availability", "ok": False, "error": str(exc)})
            return _reply(t(lang, "resched_fail", err=exc), actions)
        sess.slots = slots
        actions.append({"tool": "check_availability", "ok": True, "count": len(slots)})
        if not slots:
            return _reply(t(lang, "no_slots", date=nd), actions)
        sess.state = AWAIT_RESCHED_TIME
        return _reply(_times_text(lang, nd, slots, draft=sess.draft), actions)

    if sess.state == AWAIT_RESCHED_TIME:
        tm = _parse_time(message)
        if not tm:
            return _reply(t(lang, "bad_time", options=", ".join(sess.slots[:10])), actions)
        if sess.slots and tm not in sess.slots:
            return _reply(t(lang, "slot_taken", options=", ".join(sess.slots[:12])), actions)
        if d.date == appt.get("date") and tm == appt.get("time"):
            return _reply(t(lang, "resched_same", options=", ".join(sess.slots[:12])), actions)
        d.time = tm
        sess.state = AWAIT_RESCHED_CONFIRM
        return _reply(_resched_summary(sess) + "\n\n" + t(lang, "resched_yes_no"), actions)

    # AWAIT_RESCHED_CONFIRM — exact yes required
    if is_exact_decline(message):
        appt_id = appt["id"]
        do_reset()
        return _reply(t(lang, "resched_keep_prefix", id=appt_id), actions)
    if not is_exact_confirm(message):
        return _reply(t(lang, "resched_confirm_redo", id=appt["id"]) + "\n" + _resched_summary(sess), actions)

    appt_id = int(appt["id"])
    # Same appointment + same target slot ⇒ same key, so a retried/duplicated "yes" is a no-op server-side.
    idem = f"wa-resched:{tenant_id}:{appt_id}:{d.staff_id}:{d.date}:{d.time}"
    payload = {
        "date": d.date,
        "time": d.time,
        "staff_id": d.staff_id,
        "idempotency_key": idem,
    }
    try:
        result = await run_tool(
            "reschedule_appointment", tenant_id=tenant_id, appointment_id=appt_id, **payload
        )
        actions.append({"tool": "reschedule_appointment", "ok": True})
    except Exception as exc:
        actions.append({"tool": "reschedule_appointment", "ok": False, "error": str(exc)})
        if _http_status(exc) == 409:
            # Slot taken in the meantime: keep the appointment target, re-ask for a date.
            d.date = d.time = None
            sess.slots = []
            sess.state = AWAIT_RESCHED_DATE
            return _reply(t(lang, "resched_conflict"), actions)
        # NOTE: deliberately not status="failed"/retryable — the backend would re-POST a *new* booking.
        do_reset()
        return _reply(
            t(lang, "resched_fail", err=exc),
            actions,
            {
                "status": "reschedule_failed",
                "salon_appointment_id": appt_id,
                "payload": payload,
                "idempotency_key": idem,
                "error": str(exc),
            },
        )

    new_appt = result.get("appointment") if isinstance(result, dict) else None
    if not isinstance(new_appt, dict) or not new_appt.get("id"):
        actions[-1] = {"tool": "reschedule_appointment", "ok": False, "error": "no_appointment_in_result"}
        do_reset()
        return _reply(
            t(lang, "resched_fail", err="no_appointment_in_result"),
            actions,
            {
                "status": "reschedule_failed",
                "salon_appointment_id": appt_id,
                "payload": payload,
                "idempotency_key": idem,
                "error": "no_appointment_in_result",
                "result": result,
            },
        )
    label = f"*{d.service_name}*\n" if d.service_name else ""
    reply = t(
        lang, "resched_done",
        id=appt_id, old_date=appt["date"], old_time=appt["time"],
        date=d.date, time=d.time, label=label, brand=brand,
    )
    new_date, new_time = d.date, d.time
    do_reset()
    return _reply(
        reply,
        actions,
        {
            "status": "rescheduled",
            "salon_appointment_id": appt_id,
            "previous": {"date": appt["date"], "time": appt["time"]},
            "current": {"date": new_date, "time": new_time},
            "payload": payload,
            "idempotency_key": idem,
            "result": result,
        },
    )
