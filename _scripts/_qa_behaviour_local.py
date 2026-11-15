"""Local behaviour QA for intents/script/cancel/lang — no production writes."""
import json
from pathlib import Path

from app.booking_flow import (
    Session,
    detect_intent,
    detect_script_mode,
    detect_lang,
    update_script_mode,
    is_faq_message,
    AWAIT_DATE,
)
from app.handoff import wants_human

cases = [
    # price
    ("price enquiry EN", "How much is a ladies haircut?", "chat", "english", True),
    ("price Singlish", "hair cut mila eka kiyanna", "chat", "singlish", True),
    ("price SI", "හෙයාර් කට් එකක මිල කීයද", "chat", "sinhala", True),
    # length
    ("keratin Singlish", "keratin eka mila kiyanna", "chat", "singlish", True),
    # book
    ("book EN", "I want to book an appointment", "book", "english", False),
    ("book Singlish", "heta 10 am book karanna oni", "book", "singlish", False),
    ("book SI", "හෙට වෙන්කරන්න ඕනේ", "book", "sinhala", False),
    # cancel + identify path
    ("cancel EN", "cancel my appointment", "cancel", "english", False),
    ("cancel Singlish", "Cancel karann oni appointment rka", "cancel", "singlish", False),
    ("cancel mage", "mage appointment eka cancel karann oni", "cancel", "singlish", False),
    ("cancel membership NOT", "cancel my membership", "chat", "english", False),
    # reschedule
    ("resched EN", "reschedule my appointment", "reschedule", "english", False),
    ("resched Singlish", "appointment eka change karanna oni", "reschedule", "singlish", False),
    # mid-book cancel
    ("mid cancel", "mage appointment eka cancel karann oni", "cancel", "singlish", False),
    # discounts / complaints / handoff
    ("discount", "can I get a discount", "chat", "english", False),
    ("complaint", "I want to talk to the manager now, this is unacceptable", "chat", "english", False),
    ("handoff phrase", "please transfer me to a human agent", "chat", "english", False),
]

results = []
for name, msg, expect_intent, expect_script, expect_faq in cases:
    sess = Session()
    if name == "mid cancel":
        sess.state = AWAIT_DATE
    intent = detect_intent(msg, sess)
    script = detect_script_mode(msg)
    lang = detect_lang(msg)
    faq = is_faq_message(msg)
    human = wants_human(msg)
    sticky = update_script_mode("singlish", "yes") if "cancel" in name or "book" in name else None
    ok_intent = intent == expect_intent
    ok_script = script == expect_script
    ok_faq = (faq == expect_faq) if expect_faq is not None else True
    results.append({
        "case": name,
        "message": msg,
        "intent": intent,
        "expect_intent": expect_intent,
        "intent_ok": ok_intent,
        "script": script,
        "expect_script": expect_script,
        "script_ok": ok_script,
        "lang": lang,
        "faq": faq,
        "wants_human": human,
        "sticky_after_yes": sticky,
        "pass": ok_intent and ok_script and ok_faq,
    })

# Handoff-focused
handoff_cases = [
    "I want to speak to a manager",
    "give me a human please",
    "refund my payment now",
    "this is a complaint about billing",
]
handoff = []
for m in handoff_cases:
    handoff.append({"message": m, "wants_human": wants_human(m)})

passed = sum(1 for r in results if r["pass"])
score = round(100 * passed / len(results), 1)
out = {
    "passed": passed,
    "total": len(results),
    "score_pct": score,
    "results": results,
    "handoff_checks": handoff,
}
Path(r"e:\salon_v1\_scripts\_qa_behaviour_local.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(json.dumps({"passed": passed, "total": len(results), "score_pct": score}, indent=2))
for r in results:
    mark = "PASS" if r["pass"] else "FAIL"
    print(f"{mark} {r['case']}: intent={r['intent']} (exp {r['expect_intent']}) script={r['script']} (exp {r['expect_script']}) human={r['wants_human']}")
print("handoff:", handoff)
