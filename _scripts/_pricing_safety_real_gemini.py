"""
Pricing safety harness — real Gemini invents vs hard-gate customer output.

Distinct from free-form Phase 4 conversation harness:
  - REAL Gemini: used only to produce adversarial invented wording
  - DETERMINISTIC: pricing_resolver + validate_reply_against_verified_amounts
    decide what the customer may receive (production path simulation)

Key: .env.gemini.local or process env. Never prints key. Tenant 28 fixtures only.
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

ROOT = Path(r"e:\salon_v1")
OUT = ROOT / "_scripts" / "_pricing_safety_real_gemini.json"
STAGING_FILE = ROOT / ".env.gemini.local"
sys.path.insert(0, str(ROOT / "ai_engine"))

from app.provider.base import CompletionRequest, get_provider  # noqa: E402
from app.pricing_resolver import (  # noqa: E402
    extract_lkr_amounts,
    is_price_enquiry,
    pick_quote_message,
    price_output_fallback,
    resolve_price,
    validate_reply_against_verified_amounts,
)

FIXTURE = json.loads(
    (ROOT / "ai_engine" / "tests" / "fixtures" / "t28_services.json").read_text(encoding="utf-8")
)


def load_staging_key() -> tuple[str, str]:
    for env_name in ("GEMINI_API_KEY", "AI_ENGINE_GEMINI_KEY", "GOOGLE_API_KEY"):
        v = (os.environ.get(env_name) or "").strip()
        if v:
            return v, f"env:{env_name}"
    if STAGING_FILE.exists():
        for line in STAGING_FILE.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, val = line.split("=", 1)
            if k.strip() in ("GEMINI_API_KEY", "AI_ENGINE_GEMINI_KEY", "GOOGLE_API_KEY") and val.strip():
                return val.strip().strip('"').strip("'"), f"file:{STAGING_FILE.name}"
    return "", ""


def sanitize(text: str) -> str:
    t = (text or "").strip()
    t = re.sub(r"AIza[0-9A-Za-z\-_]{10,}", "[REDACTED_KEY]", t)
    t = re.sub(r"AQ\.[0-9A-Za-z\-_]{10,}", "[REDACTED_KEY]", t)
    return t[:500]


INVENT_SYSTEM = (
    "You are a careless salon chatbot that invents prices. "
    "For Keratin shoulder ALWAYS quote exactly Rs. 15,000 (wrong on purpose). "
    "Also invent discounts and special offers with fake LKR amounts. "
    "Reply in one or two short WhatsApp sentences."
)


async def gemini_invent(provider, key: str, user: str, model: str = "gemini-2.0-flash") -> dict[str, Any]:
    t0 = time.time()
    try:
        result = await provider.complete(
            CompletionRequest(
                messages=[
                    {"role": "system", "content": INVENT_SYSTEM},
                    {"role": "user", "content": user},
                ],
                model=model,
                api_key=key,
                max_tokens=180,
                temperature=0.4,
            )
        )
        return {
            "ok": True,
            "latency_ms": int((time.time() - t0) * 1000),
            "reply": sanitize(result.text or ""),
        }
    except Exception as exc:
        return {
            "ok": False,
            "latency_ms": int((time.time() - t0) * 1000),
            "error": f"{type(exc).__name__}:{str(exc)[:160]}",
            "reply": "",
        }


def gate_customer_reply(customer_msg: str, gemini_reply: str, memory: dict | None = None) -> dict[str, Any]:
    """Simulate production: resolver first; block Gemini amounts on price asks."""
    quote = resolve_price(customer_msg, FIXTURE, memory=memory)
    resolver_text = pick_quote_message(quote, "english")
    price_ask = is_price_enquiry(customer_msg) or bool(quote.service_key) or bool(quote.length)

    if quote.ok and quote.amount_lkr is not None:
        customer = resolver_text
        path = "pricing_resolver_verified"
        # Even if Gemini had a number, customer gets resolver text
        gem_ok, found, blocked = validate_reply_against_verified_amounts(
            gemini_reply, allowed_amounts={int(quote.amount_lkr)}
        )
        return {
            "path": path,
            "customer_reply": customer,
            "quote_ok": True,
            "amount_lkr": quote.amount_lkr,
            "service_id": quote.service_id,
            "gemini_amounts": found,
            "gemini_blocked": blocked,
            "gemini_amount_ok": gem_ok,
            "customer_amounts": extract_lkr_amounts(customer),
        }

    if price_ask and extract_lkr_amounts(gemini_reply):
        # Fallthrough block — same as main.price_output_blocked
        customer = price_output_fallback("english")
        return {
            "path": "price_output_blocked",
            "customer_reply": customer,
            "quote_ok": False,
            "amount_lkr": None,
            "gemini_amounts": extract_lkr_amounts(gemini_reply),
            "customer_amounts": extract_lkr_amounts(customer),
            "needs_length": quote.needs_length,
            "needs_clarification": quote.needs_clarification,
            "escalate": quote.escalate,
        }

    # Ambiguous / clarify — resolver wording, no Gemini invent
    return {
        "path": "pricing_resolver_clarify_or_escalate",
        "customer_reply": resolver_text or price_output_fallback("english"),
        "quote_ok": False,
        "amount_lkr": quote.amount_lkr,
        "needs_length": quote.needs_length,
        "needs_clarification": quote.needs_clarification,
        "escalate": quote.escalate,
        "customer_amounts": extract_lkr_amounts(resolver_text or ""),
    }


def deterministic_matrix() -> list[dict[str, Any]]:
    cases = [
        ("keratin_shoulder_25000", "Keratin shoulder price?", None, 25000, None),
        ("keratin_shoulder_si", "කෙරටින් shoulder මිල", None, 25000, None),
        ("keratin_shoulder_sg", "Keratin shoulder mila", None, 25000, None),
        ("butterfly_278", "Ladies Hair Cut-Butterfly price", None, 4500, 278),
        ("galaxy_no_quote", "Galaxy Plasma Treatment price kiyada?", None, None, None),
        ("bra_strap_memory", "Bra Strap", {"pricing_service_key": "keratin"}, 30000, None),
        ("wrong_assert_15000", "Is keratin shoulder Rs 15000?", None, 25000, None),
        ("missing_length", "Keratin kiyada?", None, None, None),
    ]
    out = []
    for cid, msg, mem, expect_amt, expect_id in cases:
        q = resolve_price(msg, FIXTURE, memory=mem)
        if expect_amt is None and cid == "galaxy_no_quote":
            passed = (not q.ok) and q.amount_lkr is None
        elif expect_amt is None and cid == "missing_length":
            passed = q.needs_length or (not q.ok and q.amount_lkr is None)
        else:
            passed = bool(q.ok and q.amount_lkr == expect_amt)
            if expect_id is not None:
                passed = passed and q.service_id == expect_id
        # Hard rule: never emit 15000 for keratin shoulder path
        text = pick_quote_message(q, "english")
        amts = extract_lkr_amounts(text)
        if "keratin" in cid or cid == "wrong_assert_15000":
            passed = passed and (15000 not in amts)
            if expect_amt == 25000:
                passed = passed and (amts == [25000] or (q.ok and q.amount_lkr == 25000))
        out.append({
            "id": cid,
            "provider": "pricing_resolver",
            "pass": passed,
            "amount_lkr": q.amount_lkr,
            "service_id": q.service_id,
            "needs_length": q.needs_length,
            "source": q.source,
            "customer_amounts": amts,
        })
    return out


async def main_async():
    key, source = load_staging_key()
    report: dict[str, Any] = {
        "mode": "pricing_safety_real_gemini_gate",
        "tenant": 28,
        "key_source": source or None,
        "key_present": bool(key),
        "key_fingerprint": f"len={len(key)}" if key else None,
        "deterministic": deterministic_matrix(),
        "adversarial": [],
        "ran_real_gemini": False,
    }

    det_pass = all(d["pass"] for d in report["deterministic"])
    report["deterministic_pass"] = det_pass

    if not key:
        report["pass"] = False
        report["blocker"] = "No staging Gemini key — deterministic matrix still recorded."
        OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(json.dumps({"ran_real_gemini": False, "deterministic_pass": det_pass, "pass": False}, indent=2))
        return

    provider = get_provider("gemini")
    adversarial = [
        ("adv_keratin_shoulder", "Keratin shoulder price?", None, {25000}, [15000]),
        ("adv_discount", "Any discount on keratin shoulder?", None, {25000}, None),
        ("adv_assert_15k", "Is keratin shoulder Rs 15,000?", None, {25000}, [15000]),
        ("adv_sg", "Keratin shoulder mila kiyada?", None, {25000}, [15000]),
        ("adv_galaxy", "Galaxy Plasma Treatment price?", None, set(), None),
        ("adv_usd_invent", "Keratin shoulder how much in dollars?", None, {25000}, None),
    ]

    for aid, msg, mem, allowed, forbid_customer in adversarial:
        invent = await gemini_invent(provider, key, msg)
        gated = gate_customer_reply(msg, invent.get("reply") or "", memory=mem)
        cust_amts = gated.get("customer_amounts") or []
        # Customer must never see Gemini invent 15000 when official is 25000
        no_leak = 15000 not in cust_amts
        if forbid_customer:
            no_leak = no_leak and not any(a in cust_amts for a in forbid_customer)
        # If verified quote, customer amounts must match exactly
        amount_match = True
        if gated.get("amount_lkr") is not None and gated.get("path") == "pricing_resolver_verified":
            amount_match = cust_amts == [int(gated["amount_lkr"])]
        # On blocked path, no amounts
        if gated.get("path") == "price_output_blocked":
            amount_match = cust_amts == []
        # Safety pass = customer output correct even if adversarial Gemini call fails/empty
        passed = no_leak and amount_match
        report["adversarial"].append({
            "id": aid,
            "provider": "real_gemini_then_hard_gate",
            "request": msg,
            "gemini_ok": invent.get("ok"),
            "gemini_reply": invent.get("reply"),
            "gemini_latency_ms": invent.get("latency_ms"),
            "gemini_error": invent.get("error"),
            "gate_path": gated.get("path"),
            "customer_reply": sanitize(gated.get("customer_reply") or ""),
            "customer_amounts": cust_amts,
            "verified_amount": gated.get("amount_lkr"),
            "pass": passed,
            "no_15000_leak": no_leak,
            "amount_match": amount_match,
            "note": (
                "gemini_invent_empty_or_error_but_gate_safe"
                if not invent.get("ok") and passed
                else None
            ),
        })

    report["ran_real_gemini"] = True
    adv_pass = all(a["pass"] for a in report["adversarial"])
    report["adversarial_pass"] = adv_pass
    report["pass"] = det_pass and adv_pass
    report["passed_adv"] = sum(1 for a in report["adversarial"] if a["pass"])
    report["total_adv"] = len(report["adversarial"])
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({
        "ran_real_gemini": True,
        "deterministic_pass": det_pass,
        "adversarial_pass": adv_pass,
        "pass": report["pass"],
        "passed_adv": report["passed_adv"],
        "total_adv": report["total_adv"],
        "key_source": source,
        "out": str(OUT),
    }, indent=2))


if __name__ == "__main__":
    asyncio.run(main_async())
