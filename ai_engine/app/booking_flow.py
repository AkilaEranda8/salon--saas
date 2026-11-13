"""
WhatsApp AI CRM booking dialogue — separate from legacy ai_bot.
Deterministic state machine + salon tool calls: book, cancel (with confirm), reschedule.

Session state lives in Redis (see session_store). Key layout:
    ai:booking:session:{tenant_id}:{conversation_id or 0}:{phone}
Use `clear_session(tenant_id, phone)` (re-exported below) to drop it, e.g. when a human claims the chat.
"""
from __future__ import annotations

import re
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
    {"yes", "y", "ok", "okay", "confirm", "ඔව්", "ඔව්යි", "ඔවු", "හරි", "ஆம்", "ஆமாம்", "சரி"}
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


def detect_lang(text: str) -> Optional[str]:
    """'si' / 'ta' when that script dominates, 'en' for Latin text, None if no letters."""
    si, ta, latin = _script_counts(text)
    total = si + ta + latin
    if total == 0:
        return None
    if si / total >= 0.4:
        return "si"
    if ta / total >= 0.4:
        return "ta"
    return "en"


def update_lang(current: str, text: str) -> str:
    """Switch to si/ta immediately; back to English only on a real English message
    (so a lone 'yes'/'ok' from a Sinhala/Tamil customer doesn't flip the language)."""
    detected = detect_lang(text)
    if detected in ("si", "ta"):
        return detected
    if detected == "en":
        if current == "en":
            return "en"
        words = [w for w in re.findall(r"[A-Za-z]+", text or "") if len(w) > 1]
        if len(words) >= 3:
            return "en"
    return current if current in ("en", "si", "ta") else "en"


_T: dict[str, dict[str, str]] = {
    # labels
    "lbl_service": {"en": "Service", "si": "සේවාව", "ta": "சேவை"},
    "lbl_staff": {"en": "Staff", "si": "ස්ටයිලිස්ට්", "ta": "ஸ்டைலிஸ்ட்"},
    "lbl_when": {"en": "When", "si": "වේලාව", "ta": "நேரம்"},
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
    },
    "yes_no_redo": {
        "en": "Please reply *yes* to confirm or *no* to cancel.",
        "si": "කරුණාකර තහවුරු කිරීමට *yes* හෝ අවලංගු කිරීමට *no* යවන්න.",
        "ta": "உறுதிப்படுத்த *yes* அல்லது ரத்து செய்ய *no* என அனுப்புங்கள்.",
    },
    "abort": {
        "en": "No problem — stopped. How else can I help?",
        "si": "කමක් නැහැ — නතර කළා. තවත් කුමක් උදව් කරන්නද?",
        "ta": "சரி — நிறுத்திவிட்டேன். வேறு எப்படி உதவலாம்?",
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
        "en": "What date? (today / tomorrow / Monday / YYYY-MM-DD)",
        "si": "කුමන දිනයටද? (අද / හෙට / සඳුදා / YYYY-MM-DD)",
        "ta": "எந்த தேதி? (இன்று / நாளை / திங்கள் / YYYY-MM-DD)",
    },
    "bad_date": {
        "en": "Please send a date like *tomorrow*, *Saturday*, or *2026-08-05*.",
        "si": "කරුණාකර *හෙට*, *සෙනසුරාදා* හෝ *2026-08-05* වැනි දිනයක් එවන්න.",
        "ta": "*நாளை*, *சனிக்கிழமை* அல்லது *2026-08-05* போன்ற தேதியை அனுப்புங்கள்.",
    },
    "no_slots": {
        "en": "No open slots on {date} for {staff}. Try another date?",
        "si": "{date} දින {staff} සමඟ හිස් වේලාවන් නැත. වෙනත් දිනයක් උත්සාහ කරමුද?",
        "ta": "{date} அன்று {staff} உடன் காலி நேரம் இல்லை. வேறு தேதி முயற்சிக்கலாமா?",
    },
    "times": {
        "en": "Available times on {date}:\n{shown}{more}\n\nWhich time?",
        "si": "{date} දින ලබාගත හැකි වේලාවන්:\n{shown}{more}\n\nකුමන වේලාවද?",
        "ta": "{date} அன்று கிடைக்கும் நேரங்கள்:\n{shown}{more}\n\nஎந்த நேரம்?",
    },
    "bad_time": {
        "en": "Send a time like *10:00* or *2pm*. Options: {options}",
        "si": "*10:00* හෝ *2pm* වැනි වේලාවක් එවන්න. විකල්ප: {options}",
        "ta": "*10:00* அல்லது *2pm* போன்ற நேரத்தை அனுப்புங்கள். விருப்பங்கள்: {options}",
    },
    "slot_taken": {
        "en": "That slot isn’t free. Try: {options}",
        "si": "ඒ වේලාව නිදහස් නැත. මේවා උත්සාහ කරන්න: {options}",
        "ta": "அந்த நேரம் காலியாக இல்லை. இவற்றை முயற்சிக்கவும்: {options}",
    },
    "ask_name": {
        "en": "What name should we put on the booking?",
        "si": "වෙන්කිරීමට දාන්නේ කුමන නමද?",
        "ta": "முன்பதிவில் எந்த பெயரை சேர்க்க வேண்டும்?",
    },
    "ask_name_short": {
        "en": "Please send your name.",
        "si": "කරුණාකර ඔබේ නම එවන්න.",
        "ta": "உங்கள் பெயரை அனுப்புங்கள்.",
    },
    "draft_cancelled": {
        "en": "Okay, I cancelled that booking draft. Say *book* anytime to start again.",
        "si": "හරි, එම වෙන්කිරීමේ කෙටුම්පත අවලංගු කළා. නැවත ආරම්භ කිරීමට *book* යවන්න.",
        "ta": "சரி, அந்த முன்பதிவு வரைவை ரத்து செய்தேன். மீண்டும் தொடங்க *book* என அனுப்புங்கள்.",
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
        "en": "You’re booked! ✅\n*{service}* with {staff}\n{date} at {time}\nSee you at {brand}!",
        "si": "වෙන්කිරීම සාර්ථකයි! ✅\n*{service}* — {staff}\n{date} {time}\n{brand} හිදී හමුවෙමු!",
        "ta": "முன்பதிவு உறுதி! ✅\n*{service}* — {staff}\n{date} {time}\n{brand} இல் சந்திப்போம்!",
    },
    # shared appointment list
    "no_appts": {
        "en": "I don’t see any upcoming appointments on this number.",
        "si": "මේ අංකයට ඉදිරි වෙන්කිරීම් කිසිවක් නැත.",
        "ta": "இந்த எண்ணில் வரவிருக்கும் முன்பதிவுகள் எதுவும் இல்லை.",
    },
    "appts_load_fail": {
        "en": "I couldn’t load your appointments right now. Please try again shortly.",
        "si": "දැන් ඔබේ වෙන්කිරීම් ලබාගත නොහැකි විය. මොහොතකින් නැවත උත්සාහ කරන්න.",
        "ta": "இப்போது உங்கள் முன்பதிவுகளை ஏற்ற முடியவில்லை. சிறிது நேரத்தில் மீண்டும் முயற்சிக்கவும்.",
    },
    "pick_number": {
        "en": "Reply with the appointment number from the list.",
        "si": "ලැයිස්තුවේ ඇති වෙන්කිරීමේ අංකය එවන්න.",
        "ta": "பட்டியலில் உள்ள முன்பதிவு எண்ணை அனுப்புங்கள்.",
    },
    "bad_number": {
        "en": "That number isn’t on the list. Try again.",
        "si": "ඒ අංකය ලැයිස්තුවේ නැත. නැවත උත්සාහ කරන්න.",
        "ta": "அந்த எண் பட்டியலில் இல்லை. மீண்டும் முயற்சிக்கவும்.",
    },
    # cancel
    "cancel_pick": {
        "en": "Which appointment should I cancel?\n{lines}\n\nReply with the number.",
        "si": "කුමන වෙන්කිරීම අවලංගු කරන්නද?\n{lines}\n\nඅංකය එවන්න.",
        "ta": "எந்த முன்பதிவை ரத்து செய்யவேண்டும்?\n{lines}\n\nஎண்ணை அனுப்புங்கள்.",
    },
    "cancel_confirm": {
        "en": "Cancel appointment #{id} on {date} {time}?\nReply *yes* to cancel it or *no* to keep it.",
        "si": "{date} {time} ට ඇති #{id} වෙන්කිරීම අවලංගු කරන්නද?\nඅවලංගු කිරීමට *yes* (ඔව්) හෝ තබාගැනීමට *no* (නැහැ) යවන්න.",
        "ta": "{date} {time} அன்று #{id} முன்பதிவை ரத்து செய்யவா?\nரத்து செய்ய *yes* (ஆம்), வைத்திருக்க *no* (இல்லை) என அனுப்புங்கள்.",
    },
    "cancel_confirm_redo": {
        "en": "Please reply *yes* to cancel appointment #{id} or *no* to keep it.",
        "si": "#{id} වෙන්කිරීම අවලංගු කිරීමට *yes* හෝ තබාගැනීමට *no* යවන්න.",
        "ta": "#{id} முன்பதிவை ரத்து செய்ய *yes*, வைத்திருக்க *no* என அனுப்புங்கள்.",
    },
    "cancel_kept": {
        "en": "Okay — I kept appointment #{id}. Nothing was cancelled.",
        "si": "හරි — #{id} වෙන්කිරීම තබාගත්තා. කිසිවක් අවලංගු කළේ නැත.",
        "ta": "சரி — #{id} முன்பதிவை வைத்திருக்கிறேன். எதுவும் ரத்து செய்யப்படவில்லை.",
    },
    "cancel_fail": {
        "en": "Couldn’t cancel that appointment ({err}).",
        "si": "ඒ වෙන්කිරීම අවලංගු කළ නොහැකි විය ({err}).",
        "ta": "அந்த முன்பதிவை ரத்து செய்ய முடியவில்லை ({err}).",
    },
    "cancelled": {
        "en": "Cancelled appointment #{id} on {date} {time}.",
        "si": "{date} {time} ට ඇති #{id} වෙන්කිරීම අවලංගු කළා.",
        "ta": "{date} {time} அன்று #{id} முன்பதிவு ரத்து செய்யப்பட்டது.",
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


def t(lang: str, key: str, **kw: Any) -> str:
    entry = _T[key]
    tpl = entry.get(lang) or entry["en"]
    return tpl.format(**kw) if kw else tpl


@dataclass
class BookingDraft:
    branch_id: Optional[int] = None
    service_id: Optional[int] = None
    service_name: Optional[str] = None
    duration: int = 30
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


def session_key(tenant_id: int, conversation_id: Optional[int], phone: Optional[str]) -> str:
    # Prefer conversation id for multi-replica Redis key (C12)
    return f"{tenant_id}:{conversation_id or 0}:{phone or 'unknown'}"


def _session_to_dict(sess: Session) -> dict[str, Any]:
    return {
        "state": sess.state,
        "mode": sess.mode,
        "lang": sess.lang,
        "draft": asdict(sess.draft),
        "services": sess.services,
        "staff": sess.staff,
        "slots": sess.slots,
    }


def _session_from_dict(data: Optional[dict[str, Any]]) -> Session:
    if not data:
        return Session()
    draft_raw = data.get("draft") or {}
    draft = BookingDraft(**{k: draft_raw.get(k) for k in BookingDraft.__dataclass_fields__})
    draft.cancel_candidates = draft.cancel_candidates or []
    draft.duration = draft.duration or 30
    lang = data.get("lang")
    return Session(
        state=data.get("state") or IDLE,
        draft=draft,
        services=data.get("services") or [],
        staff=data.get("staff") or [],
        slots=data.get("slots") or [],
        mode=data.get("mode") or "book",
        lang=lang if lang in ("en", "si", "ta") else "en",
    )


def get_session(key: str) -> Session:
    return _session_from_dict(load_session_raw(key))


def save_session(key: str, sess: Session) -> None:
    save_session_raw(key, _session_to_dict(sess))


def reset_session(key: str) -> None:
    delete_session(key)
    save_session_raw(key, _session_to_dict(Session()))


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


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
    r"\bcancel\s+(?:my|the|this|that|our)\s+(?:appointment|booking|reservation|visit|slot)s?\b"
    r"|\bcancel\s+(?:appointment|booking|reservation)\b"
    r"|\bremove\s+(?:my\s+)?(?:booking|appointment)\b"
    r"|අවලංගු|ரத்து"
)

_RESCHEDULE_RE = re.compile(
    r"\bre-?schedul\w*\b"
    r"|\bpostpone\b"
    r"|\bchange\s+(?:my|the)\s+(?:appointment|booking|time|date)\b"
    r"|\bmove\s+(?:my|the)\s+(?:appointment|booking)\b"
    r"|\b(?:another|different|new)\s+(?:time|date|day)\s+for\s+(?:my|the)\s+(?:appointment|booking)\b"
    r"|වෙලාව\s*වෙනස්|දිනය\s*වෙනස්|නැවත\s*වෙන්|நேரத்தை\s*மாற்ற|தேதியை\s*மாற்ற"
)

# Words that clearly mean "start a booking". "available"/"i want" alone do NOT.
_BOOK_WORD_RE = re.compile(
    r"\b(?:book|booking|bookings|reserve|reservation|appointments?|schedule|slots?)\b"
    r"|වෙන්\s*කර|වෙන්කර|බුක්|முன்பதிவு|புக்"
)
_SERVICE_WORD_RE = re.compile(
    r"\b(?:hair\s*cut|haircut|trim|colou?r(?:ing)?|facial|massage|manicure|pedicure|bridal|"
    r"waxing|threading|spa|keratin|rebonding|hair\s*style|blow\s*dry|nails?)\b"
)
_WANT_RE = re.compile(
    r"\b(?:i\s+want|i\s+need|i'?d\s+like|id\s+like|i\s+would\s+like|want\s+to|looking\s+for|"
    r"can\s+i\s+(?:get|have|do)|available|availability)\b"
)
# Real booking *actions* — these win over FAQ words ("book a haircut, how much is it?").
_BOOK_ACTION_RE = re.compile(
    r"\b(?:book|reserve|schedule)\b|\b(?:make|get|need|want)\s+(?:an?\s+)?appointment\b|\bappointment\s+for\b"
    r"|වෙන්\s*කර|වෙන්කර|முன்பதிவு"
)

_FAQ_RE = re.compile(
    r"\b(?:opening|closing|working|business|open)\s+(?:hours?|times?)\b|\bhours\b"
    r"|\bwhat\s+time\s+(?:do|does|are|is)\s+(?:you|u|the\s+salon|it)\s+(?:open|close|closing|opening)\b"
    r"|\bwhen\s+(?:do|does|are|is)\s+(?:you|u|the\s+salon)\s+(?:open|close|opening|closing)\b"
    r"|\b(?:are\s+you|is\s+the\s+salon)\s+open\b"
    r"|\bwhere\s+(?:are\s+you|is\s+the\s+salon)\b|\bwhere\s+(?:are\s+you\s+)?located\b"
    r"|\b(?:location|address|directions?|parking)\b|\bhow\s+(?:do\s+i|to)\s+(?:get|reach)\b"
    r"|\b(?:price|prices|pricing|cost|costs|how\s+much|charges?|rates?|fees?)\b"
    r"|මිල|ලිපිනය|විවෘත|விலை|முகவரி"
)


def is_faq_message(text: str) -> bool:
    """Clear FAQ (hours / location / price) that isn't actually asking to book."""
    t_ = _norm(text)
    if not t_:
        return False
    if _BOOK_ACTION_RE.search(t_):
        return False
    return bool(_FAQ_RE.search(t_))


def detect_intent(text: str, sess: Session) -> str:
    t_ = _norm(text)
    if sess.state != IDLE:
        if _ABORT_RE.search(t_):
            return "abort"
        return "continue"
    if _CANCEL_RE.search(t_):
        return "cancel"
    if _RESCHEDULE_RE.search(t_):
        return "reschedule"
    if is_faq_message(t_):
        return "chat"
    if _BOOK_WORD_RE.search(t_):
        return "book"
    if _SERVICE_WORD_RE.search(t_) and _WANT_RE.search(t_):
        return "book"
    return "chat"


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


def _parse_date(text: str) -> Optional[str]:
    today = date.today()
    t_ = _norm(text)
    if re.search(r"\btoday\b", t_) or "අද" in t_ or "இன்று" in t_:
        return today.isoformat()
    if re.search(r"\b(?:tomorrow|tomoro|tmrw)\b", t_) or "හෙට" in t_ or "நாளை" in t_:
        return (today + timedelta(days=1)).isoformat()
    for i, (pat, native) in enumerate(_WEEKDAYS):
        if re.search(rf"\b(?:{pat})\b", t_) or any(n in t_ for n in native):
            delta = (i - today.weekday()) % 7
            if delta == 0:
                delta = 7
            return (today + timedelta(days=delta)).isoformat()
    m = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    if m:
        return m.group(1)
    m = re.search(r"(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?", text)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        y = int(m.group(3)) if m.group(3) else today.year
        if y < 100:
            y += 2000
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            try:
                return date(y, d, mo).isoformat()
            except ValueError:
                return None
    return None


def _valid_future_date(d: Optional[str]) -> Optional[str]:
    """Return d only if it is a real ISO date that is not in the past."""
    if not d:
        return None
    try:
        return d if date.fromisoformat(d) >= date.today() else None
    except ValueError:
        return None


def _parse_time(text: str) -> Optional[str]:
    t_ = _norm(text)
    m = re.search(r"\b(\d{1,2}):(\d{2})\b", t_)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return f"{h:02d}:{mi:02d}"
    m = re.search(r"\b(\d{1,2})\s*(am|pm)\b", t_)
    if m:
        h = int(m.group(1))
        ap = m.group(2)
        if ap == "pm" and h < 12:
            h += 12
        if ap == "am" and h == 12:
            h = 0
        return f"{h:02d}:00"
    m = re.search(r"\b(\d{1,2})\b", t_)
    if m and ":" not in t_:
        h = int(m.group(1))
        if 7 <= h <= 20:
            return f"{h:02d}:00"
    return None


def _pick_by_index_or_name(text: str, items: list[dict], name_key: str = "name") -> Optional[dict]:
    t_ = _norm(text)
    m = re.search(r"\b(\d{1,2})\b", t_)
    if m:
        idx = int(m.group(1)) - 1
        if 0 <= idx < len(items):
            return items[idx]
    for it in items:
        name = _norm(str(it.get(name_key) or ""))
        if name and (name in t_ or t_ in name):
            return it
    tokens = set(t_.split())
    best, best_score = None, 0
    for it in items:
        name = _norm(str(it.get(name_key) or ""))
        score = len(tokens & set(name.split()))
        if score > best_score:
            best, best_score = it, score
    return best if best_score >= 1 else None


def _format_list(items: list[dict], name_key: str = "name", extra_fn=None) -> str:
    lines = []
    for i, it in enumerate(items[:12], 1):
        extra = extra_fn(it) if extra_fn else ""
        lines.append(f"{i}. {it.get(name_key)}{extra}")
    return "\n".join(lines)


async def _load_services(tenant_id: int, sess: Session) -> list:
    if not sess.services:
        sess.services = await run_tool("list_services", tenant_id=tenant_id) or []
    return sess.services


def _reply(text: str, actions: list, booking: Optional[dict] = None) -> dict[str, Any]:
    return {"replyText": text, "actions": actions, "booking": booking}


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
) -> Optional[dict[str, Any]]:
    """
    Returns None if message should fall through to LLM chat.
    Else { replyText, actions, booking? }

    `faq_with_knowledge`: caller found knowledge-base context for this message. A clear FAQ
    (hours / location / price) then goes to the LLM/KB instead of entering or advancing a flow.
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
    cleared = False

    def do_reset() -> None:
        nonlocal sess, cleared
        lang = sess.lang
        try:
            reset_session(key)
        except BookingSessionUnavailable:
            pass
        sess = Session(lang=lang)
        cleared = True

    try:
        return await _handle_booking_turn_body(
            sess=sess,
            do_reset=do_reset,
            tenant_id=tenant_id,
            phone=phone,
            message=message,
            brand=brand,
            customer_name=customer_name,
            faq_with_knowledge=faq_with_knowledge,
        )
    except BookingSessionUnavailable as exc:
        return _reply(
            t(sess.lang, "session_down_2"),
            [{"tool": "booking_session", "ok": False, "error": str(exc)}],
        )
    finally:
        if not cleared:
            try:
                save_session(key, sess)
            except BookingSessionUnavailable:
                pass


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
) -> Optional[dict[str, Any]]:
    lang = sess.lang
    intent = detect_intent(message, sess)
    actions: list[dict[str, Any]] = []

    if intent == "abort":
        do_reset()
        return _reply(t(lang, "abort"), [{"tool": "booking_abort", "ok": True}])

    # Clear FAQ + knowledge context → answer from KB, never start/advance a flow on it.
    if (
        faq_with_knowledge
        and is_faq_message(message)
        and sess.state != AWAIT_NAME
        and not (sess.state == IDLE and intent in ("cancel", "reschedule"))
    ):
        return None

    if intent == "chat" and sess.state == IDLE:
        return None

    # ── Cancel / reschedule: start ───────────────────────────────────────────
    if sess.state == IDLE and intent in ("cancel", "reschedule"):
        return await _appt_flow_start(
            mode=intent, tenant_id=tenant_id, sess=sess, phone=phone,
            actions=actions, do_reset=do_reset,
        )

    # ── Cancel flow (continue) ───────────────────────────────────────────────
    if sess.state in CANCEL_STATES:
        return await _cancel_continue(tenant_id, sess, message, actions, do_reset)

    # ── Reschedule flow (continue) ───────────────────────────────────────────
    if sess.state in RESCHED_STATES:
        return await _resched_continue(
            tenant_id, sess, phone, message, brand, actions, do_reset
        )

    # ── Start book flow ──────────────────────────────────────────────────────
    if intent == "book" and sess.state == IDLE:
        sess.mode = "book"
        sess.draft = BookingDraft(phone=phone, name=customer_name)
        services = await _load_services(tenant_id, sess)
        actions.append({"tool": "list_services", "ok": True, "count": len(services)})
        if not services:
            do_reset()
            return _reply(t(lang, "no_services", brand=brand), actions)
        sess.state = AWAIT_SERVICE
        listing = _format_list(
            services,
            extra_fn=lambda s: f" — {s.get('duration_minutes', 30)} min · LKR {s.get('price', 0)}",
        )
        return _reply(t(lang, "svc_prompt", listing=listing), actions)

    if sess.state == AWAIT_SERVICE:
        services = await _load_services(tenant_id, sess)
        picked = _pick_by_index_or_name(message, services)
        if not picked:
            return _reply(t(lang, "svc_pick", listing=_format_list(services)), actions)
        sess.draft.service_id = int(picked["id"])
        sess.draft.service_name = picked.get("name")
        sess.draft.duration = int(picked.get("duration_minutes") or 30)
        staff = await run_tool("list_staff", tenant_id=tenant_id, service_id=sess.draft.service_id) or []
        sess.staff = staff
        actions.append({"tool": "list_staff", "ok": True, "count": len(staff)})
        if not staff:
            name = sess.draft.service_name
            do_reset()
            return _reply(t(lang, "no_staff", service=name), actions)
        sess.state = AWAIT_STAFF
        return _reply(
            t(lang, "staff_prompt", service=sess.draft.service_name, listing=_format_list(staff)),
            actions,
        )

    if sess.state == AWAIT_STAFF:
        picked = _pick_by_index_or_name(message, sess.staff)
        if not picked:
            return _reply(t(lang, "staff_pick", listing=_format_list(sess.staff)), actions)
        sess.draft.staff_id = int(picked["id"])
        sess.draft.staff_name = picked.get("name")
        if picked.get("branch_id"):
            sess.draft.branch_id = int(picked["branch_id"])
        sess.state = AWAIT_DATE
        return _reply(t(lang, "ask_date"), actions)

    if sess.state == AWAIT_DATE:
        d = _valid_future_date(_parse_date(message))
        if not d:
            return _reply(t(lang, "bad_date"), actions)
        sess.draft.date = d
        slots = await _fetch_slots(tenant_id, sess.draft.staff_id, d, sess.draft.duration)
        sess.slots = slots
        actions.append({"tool": "check_availability", "ok": True, "count": len(slots)})
        if not slots:
            sess.state = AWAIT_DATE
            return _reply(t(lang, "no_slots", date=d, staff=sess.draft.staff_name), actions)
        sess.state = AWAIT_TIME
        return _reply(_times_text(lang, d, slots), actions)

    if sess.state == AWAIT_TIME:
        tm = _parse_time(message)
        if not tm:
            return _reply(t(lang, "bad_time", options=", ".join(sess.slots[:10])), actions)
        if sess.slots and tm not in sess.slots:
            return _reply(t(lang, "slot_taken", options=", ".join(sess.slots[:12])), actions)
        sess.draft.time = tm
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
            "notes": "Booked via WhatsApp AI CRM",
        }
        try:
            result = await run_tool("book_appointment", tenant_id=tenant_id, **payload)
            actions.append({"tool": "book_appointment", "ok": True})
        except Exception as exc:
            actions.append({"tool": "book_appointment", "ok": False, "error": str(exc)})
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
        reply = t(
            lang, "booked",
            service=d.service_name, staff=d.staff_name, date=d.date, time=d.time, brand=brand,
        )
        do_reset()
        return _reply(
            reply,
            actions,
            {
                "status": "confirmed",
                "salon_appointment_id": appt.get("id"),
                "payload": payload,
                "idempotency_key": idem,
                "result": result,
            },
        )

    return None


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


def _times_text(lang: str, d: str, slots: list) -> str:
    shown = ", ".join(slots[:16])
    more = f" (+{len(slots) - 16} more)" if len(slots) > 16 else ""
    return t(lang, "times", date=d, shown=shown, more=more)


def _confirm_summary(sess: Session) -> str:
    d, lang = sess.draft, sess.lang
    return (
        f"{t(lang, 'please_confirm')}\n"
        f"• {t(lang, 'lbl_service')}: {d.service_name}\n"
        f"• {t(lang, 'lbl_staff')}: {d.staff_name}\n"
        f"• {t(lang, 'lbl_when')}: {d.date} {d.time}\n"
        f"• {t(lang, 'lbl_name')}: {d.name}"
    )


# ── Cancel / reschedule: shared start + pick ─────────────────────────────────

def _slim_appt(a: dict) -> dict:
    return {
        "id": int(a["id"]),
        "date": str(a.get("date") or "")[:10],
        "time": str(a.get("time") or "")[:5],
        "status": a.get("status"),
        "staff_id": a.get("staff_id"),
        "service_id": a.get("service_id"),
        "branch_id": a.get("branch_id"),
    }


def _appt_lines(rows: list[dict]) -> str:
    return "\n".join(
        f"{i}. #{a['id']} — {a['date']} {a['time']} ({a.get('status')})"
        for i, a in enumerate(rows[:8], 1)
    )


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


async def _appt_flow_start(
    *, mode: str, tenant_id: int, sess: Session, phone: Optional[str],
    actions: list, do_reset,
) -> dict[str, Any]:
    lang = sess.lang
    sess.mode = mode
    if not phone:
        do_reset()
        return _reply(t(lang, "need_phone"), actions)
    try:
        rows = await run_tool("list_appointments", tenant_id=tenant_id, phone=phone) or []
        actions.append({"tool": "list_appointments", "ok": True, "count": len(rows)})
    except Exception as exc:
        actions.append({"tool": "list_appointments", "ok": False, "error": str(exc)})
        do_reset()
        return _reply(t(lang, "appts_load_fail"), actions)
    cands = [_slim_appt(a) for a in rows if isinstance(a, dict) and a.get("id")][:8]
    if not cands:
        do_reset()
        return _reply(t(lang, "no_appts"), actions)
    sess.draft = BookingDraft(phone=phone, cancel_candidates=cands)
    if len(cands) == 1:
        return await _appt_selected(tenant_id, sess, cands[0], actions, do_reset)
    if mode == "cancel":
        sess.state = AWAIT_CANCEL_PICK
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
        actions.append({"tool": "cancel_appointment", "ok": True})
    except Exception as exc:
        actions.append({"tool": "cancel_appointment", "ok": False, "error": str(exc)})
        do_reset()
        return _reply(t(lang, "cancel_fail", err=exc), actions)
    reply = t(lang, "cancelled", id=appt_id, date=appt["date"], time=appt["time"])
    do_reset()
    return _reply(
        reply, actions, {"status": "cancelled", "salon_appointment_id": appt_id, "result": result}
    )


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
    if d.staff_name:
        lines.append(f"• {t(lang, 'lbl_staff')}: {d.staff_name}")
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
            return _reply(t(lang, "no_slots", date=nd, staff=d.staff_name or "—"), actions)
        sess.state = AWAIT_RESCHED_TIME
        return _reply(_times_text(lang, nd, slots), actions)

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
    label = f"*{d.service_name}*" + (f" · {d.staff_name}" if d.staff_name else "") + "\n" if d.service_name else ""
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
