"""
RC6 offline evaluation harness — deterministic ask-unit / completeness suite.
Does NOT call live Gemini or WhatsApp. Does NOT print secrets.
For live Gemini staging eval, run separately with GEMINI_API_KEY set after approval.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(r"e:\salon_v1")
sys.path.insert(0, str(ROOT / "ai_engine"))

from app.conversation_intelligence import classify_intent, build_conversation_context
from app.response_quality import validate_customer_reply, decompose_customer_asks

CASES = [
    {
        "id": "multi_branch_price",
        "msg": "Butterfly kiyada? Layer thiyenawada? Kandy branch eka koheda?",
        "memory": {"last_service": "haircut"},
        "good_reply": (
            "Butterfly Rs 4,500. Layer Cut separate list naha — stylist confirm. "
            "Larvendo Kandy, William Gopallawa Mawatha."
        ),
        "bad_reply": "Butterfly is nice.",
    },
    {
        "id": "eka_price",
        "msg": "Eka keeyada?",
        "memory": {"last_service": "keratin", "current_topic": "keratin"},
        "expect_intent": "price_enquiry",
    },
    {
        "id": "cheaper_alt",
        "msg": "mita wada adu ekak nadda?",
        "memory": {"last_service": "keratin", "current_topic": "keratin"},
        "expect_intent": "alternative_request",
    },
    {
        "id": "reject_prior",
        "msg": "ehema nam epa",
        "memory": {"last_service": "rebond", "current_topic": "rebond"},
        "expect_intent": "alternative_request",
    },
]


def main() -> int:
    results = []
    for c in CASES:
        row = {"id": c["id"], "ok": True, "notes": []}
        intent = classify_intent(
            c["msg"], memory=c.get("memory"), prior_topic=(c.get("memory") or {}).get("last_service")
        )
        if c.get("expect_intent") and intent.get("intent") != c["expect_intent"]:
            row["ok"] = False
            row["notes"].append(f"intent={intent.get('intent')} expected={c['expect_intent']}")
        if "good_reply" in c:
            g = validate_customer_reply(c["msg"], c["good_reply"])
            b = validate_customer_reply(c["msg"], c["bad_reply"])
            if not g.ok:
                row["ok"] = False
                row["notes"].append(f"good_reply missing={g.missing}")
            if b.ok:
                row["ok"] = False
                row["notes"].append("bad_reply unexpectedly ok")
            row["units"] = [u.label for u in decompose_customer_asks(c["msg"])]
        ctx = build_conversation_context(message=c["msg"], memory=c.get("memory"))
        row["emotion"] = ctx.emotion
        row["topic"] = ctx.current_topic
        results.append(row)

    passed = sum(1 for r in results if r["ok"])
    out = {
        "mode": "offline_deterministic",
        "gemini_api_called": False,
        "whatsapp_sent": False,
        "passed": passed,
        "total": len(results),
        "results": results,
    }
    path = ROOT / "_scripts" / "_eval_rc6_offline_results.json"
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps({"ok": passed == len(results), "out": str(path), "passed": passed, "total": len(results)}, indent=2))
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
