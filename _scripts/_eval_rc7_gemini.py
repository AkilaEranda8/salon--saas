"""
RC7 evaluation suite — deterministic offline + optional real Gemini.

Usage:
  python _scripts/_eval_rc7_gemini.py              # offline only
  set GEMINI_API_KEY=... & python _scripts/_eval_rc7_gemini.py --live

Never sends WhatsApp. Never mutates production. Local evidence only.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"e:\salon_v1")
sys.path.insert(0, str(ROOT / "ai_engine"))

OUT = ROOT / "_scripts" / "_eval_rc7_results.json"

CASES = [
    {"id": "frag_short", "msg": "eka", "memory": {"last_service": "keratin"}, "expect_topic": "keratin"},
    {"id": "multi_q", "msg": "Butterfly kiyada? Branch eka koheda?", "memory": {}, "expect_units": 2},
    {"id": "correction", "msg": "Wrong — I meant keratin not facial", "memory": {"last_service": "facial"}, "expect_intent": "correction"},
    # also covered by extended correction patterns (i meant / wrong answer)
    {"id": "topic_switch", "msg": "Mata bridal dressing oni", "memory": {"last_service": "haircut"}, "expect_stale": True},
    {"id": "price_obj", "msg": "Ganak — mita wada adu eka thiyenawada?", "memory": {"last_service": "keratin"}},
    {"id": "singlish", "msg": "Heta ude 9 ta free da?", "memory": {"last_service": "haircut"}, "expect_implicit": True},
    {"id": "sinhala", "msg": "කෙරටින් මිල කීයද?", "memory": {}},
    {"id": "handoff", "msg": "I want to talk to a real person about a complaint", "memory": {}},
    {"id": "fake_book_guard", "msg": "Book", "reply_probe": "Let's lock in your cut tomorrow.", "expect_fail_quality": True},
    {"id": "media_guard", "msg": "Style eka hari da?", "reply_probe": "I can see your photo — nice.", "expect_media_fail": True},
]


def offline_eval() -> dict:
    from app.conversation_intelligence import (
        build_conversation_context,
        classify_intent,
        is_implicit_request,
    )
    from app.response_quality import decompose_customer_asks, validate_customer_reply
    from app.turn_planner import build_turn_plan

    results = []
    for c in CASES:
        row = {"id": c["id"], "ok": True, "checks": []}
        msg = c["msg"]
        mem = c.get("memory") or {}
        if c.get("reply_probe"):
            rep = validate_customer_reply(
                msg, c["reply_probe"], has_media=False, booking_confirmed=False
            )
            if c.get("expect_fail_quality") and rep.ok:
                row["ok"] = False
                row["checks"].append("expected_quality_fail")
            if c.get("expect_media_fail") and not rep.media_claim_without_media:
                row["ok"] = False
                row["checks"].append("expected_media_fail")
            results.append(row)
            continue

        ctx = build_conversation_context(message=msg, tenant_id=28, memory=mem)
        plan = build_turn_plan(message=msg, ctx=ctx)
        units = decompose_customer_asks(msg, prior_topic=ctx.current_topic)
        if c.get("expect_topic") and ctx.current_topic != c["expect_topic"]:
            # incomplete "eka" should resolve keratin
            if ctx.referent_topic != c["expect_topic"] and ctx.current_topic != c["expect_topic"]:
                row["ok"] = False
                row["checks"].append(f"topic={ctx.current_topic}")
        if c.get("expect_units") and len(units) < c["expect_units"]:
            row["ok"] = False
            row["checks"].append(f"units={len(units)}")
        if c.get("expect_intent"):
            intent = classify_intent(msg, memory=mem, prior_topic=mem.get("last_service"))
            if intent.get("intent") != c["expect_intent"]:
                row["ok"] = False
                row["checks"].append(f"intent={intent.get('intent')}")
        if c.get("expect_stale") and not ctx.stale_context_blocked and not ctx.is_topic_switch:
            row["ok"] = False
            row["checks"].append("stale_not_blocked")
        if c.get("expect_implicit") and not (ctx.is_implicit or "book" in (ctx.current_intent or "")):
            # Accept booking_enquiry / continuation as success for implicit slot asks
            if not is_implicit_request(msg):
                row["ok"] = False
                row["checks"].append("implicit_miss")
        row["intent"] = ctx.current_intent
        row["topic"] = ctx.current_topic
        row["tools"] = plan.selected_tools
        results.append(row)

    passed = sum(1 for r in results if r["ok"])
    return {
        "mode": "offline",
        "passed": passed,
        "total": len(results),
        "results": results,
    }


async def live_eval(api_key: str) -> dict:
    """Optional real Gemini — measures latency/tokens; not mocked."""
    from app.provider import CompletionRequest, get_provider

    provider = get_provider("gemini")
    live = []
    for c in CASES[:6]:
        if c.get("reply_probe"):
            continue
        t0 = time.time()
        try:
            req = CompletionRequest(
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are Larvendo salon WhatsApp receptionist. "
                            "Reply in matching language. Never invent prices. "
                            "Never claim booking without confirmation. One short reply."
                        ),
                    },
                    {"role": "user", "content": c["msg"]},
                ],
                model=os.environ.get("GEMINI_MODEL", "gemini-2.0-flash"),
                api_key=api_key,
                google_search=False,
                max_tokens=300,
                temperature=0.3,
            )
            result = await provider.complete(req)
            ms = (time.time() - t0) * 1000
            text = (result.text or "")[:400]
            live.append({
                "id": c["id"],
                "ok": bool(text.strip()),
                "latency_ms": round(ms, 1),
                "prompt_tokens": getattr(result, "prompt_tokens", None),
                "completion_tokens": getattr(result, "completion_tokens", None),
                "model": getattr(result, "model", None),
                "reply_preview": text[:180],
            })
        except Exception as exc:
            live.append({"id": c["id"], "ok": False, "error": str(exc)[:200]})
    return {
        "mode": "live_gemini",
        "passed": sum(1 for r in live if r.get("ok")),
        "total": len(live),
        "results": live,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true")
    args = ap.parse_args()

    evidence = {
        "rc": "phase6_t28_rc7",
        "started_utc": datetime.now(timezone.utc).isoformat(),
        "whatsapp": "NOT_SENT",
        "production_mutations": "NONE",
    }
    evidence["offline"] = offline_eval()

    key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if args.live and key:
        evidence["live"] = asyncio.run(live_eval(key))
    elif args.live:
        evidence["live"] = {"ok": False, "error": "GEMINI_API_KEY missing — offline only"}
    else:
        evidence["live"] = {
            "skipped": True,
            "note": "Pass --live with GEMINI_API_KEY for real provider evidence",
        }

    evidence["finished_utc"] = datetime.now(timezone.utc).isoformat()
    evidence["ok"] = evidence["offline"]["passed"] == evidence["offline"]["total"]
    OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps({
        "ok": evidence["ok"],
        "offline": f"{evidence['offline']['passed']}/{evidence['offline']['total']}",
        "live": evidence.get("live", {}).get("passed"),
        "out": str(OUT),
    }, indent=2))
    return 0 if evidence["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
