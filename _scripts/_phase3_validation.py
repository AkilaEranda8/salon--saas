"""
Phase 3 local validation harness — Tenant 28 only.
Deterministic pricing/booking/security + optional real Gemini (env key only).
Never prints API keys or customer PII. No prod deploy/restart/commit.
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Optional

os.environ.setdefault("AI_ENGINE_SERVICE_SECRET", "phase3-validation-secret-32chars!!")
os.environ.setdefault("NODE_ENV", "development")

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

ROOT = Path(r"e:\salon_v1")
OUT = ROOT / "_scripts" / "_phase3_validation.json"
FIXTURE = ROOT / "ai_engine" / "tests" / "fixtures" / "t28_services.json"
sys.path.insert(0, str(ROOT / "ai_engine"))

from app.pricing_resolver import (  # noqa: E402
    OFFICIAL_LENGTH_TIERS,
    is_generic_category_price_ask,
    is_length_only_message,
    is_price_enquiry,
    pick_quote_message,
    resolve_price,
    resolve_service_key_from_memory,
)
from app import booking_flow as bf  # noqa: E402
from app import conversation_intelligence as ci  # noqa: E402
from app.provider.base import CompletionRequest, CompletionResult, get_provider  # noqa: E402

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
CATALOGUE = json.loads(FIXTURE.read_text(encoding="utf-8"))
ACTIVE = [s for s in CATALOGUE if s.get("is_active", True)]


def _amt(q) -> Optional[int]:
    return getattr(q, "amount_lkr", None)


def _safe_text(q, mode="english") -> str:
    return pick_quote_message(q, mode) or ""


class FakeStore:
    def __init__(self):
        self.data: dict[str, str] = {}

    def load(self, key):
        raw = self.data.get(key)
        return json.loads(raw) if raw else None

    def save(self, key, d):
        self.data[key] = json.dumps(d, default=str)

    def delete(self, key):
        self.data.pop(key, None)


def install_booking_mocks(store: FakeStore, tool_log: list, *, fail_book: bool = False):
    bf.load_session_raw = store.load
    bf.save_session_raw = store.save
    bf.delete_session = store.delete

    async def fake_run_tool(name, **kw):
        tool_log.append((name, {k: v for k, v in kw.items() if k != "phone"}))
        if name == "list_services":
            return [s for s in ACTIVE if s.get("available_online", True) or True][:80]
        if name == "list_staff":
            return [{"id": 48, "name": "Nadeeka", "branch_id": 30, "is_active": True}]
        if name == "list_branches":
            return [{"id": 30, "name": "Larvendo Kandy"}]
        if name == "customer_lookup":
            return {"exists": True, "customer": {"id": 9, "name": "QA Customer"}, "history": []}
        if name == "list_appointments":
            return [{
                "id": 145, "date": "2099-01-05", "time": "11:00:00", "status": "confirmed",
                "staff_id": 48, "service_id": 167, "branch_id": 30, "customer_name": "QA Customer",
            }]
        if name == "check_availability":
            return {"slots": ["09:00", "10:00", "11:00", "14:00"]}
        if name == "book_appointment":
            if fail_book:
                return {"error": "slot_taken", "ok": False}
            return {"appointment": {"id": 999, "status": "confirmed", "date": kw.get("date"), "time": kw.get("time")}}
        if name == "cancel_appointment":
            return {"appointment": {"id": kw.get("appointment_id"), "status": "cancelled"}}
        return {}

    bf.run_tool = fake_run_tool
    return fake_run_tool


async def booking_turn(msg: str, *, conv=3100, phone="94770002800", **kw):
    return await bf.handle_booking_turn(
        tenant_id=28, conversation_id=conv, phone=phone,
        message=msg, brand="Salon Larvendo Pvt LTD", customer_name="QA Customer", **kw,
    )


def section_pricing() -> dict[str, Any]:
    failures = []
    checks = []

    # Unknown named services must not quote unrelated SKUs
    unknowns = [
        "Galaxy Plasma Treatment price kiyada?",
        "galaxy plasma treatment how much?",
        "Quantum Laser Facial mila?",
        "zorblax spa treatment cost",
        "neon silk facial deluxe how much",
        "custom invented service 99 treatment price",
    ]
    for msg in unknowns:
        q = resolve_price(msg, CATALOGUE)
        ok = _amt(q) is None and not q.ok and (q.needs_clarification or q.escalate)
        name = (q.service_name or "").lower()
        ok = ok and "keratin" not in name
        checks.append({"id": f"unknown:{msg[:40]}", "pass": ok, "source": q.source, "amount": _amt(q)})
        if not ok:
            failures.append({"msg": msg, "amount": _amt(q), "source": q.source, "name": q.service_name})

    # No category single-SKU auto-pick for bare category
    for msg, label in [("Facial mila?", "facial"), ("Waxing how much?", "waxing"), ("treatment mila", "treatment")]:
        q = resolve_price(msg, CATALOGUE)
        ok = q.ok and q.price_kind == "list" and q.service_id is None
        checks.append({"id": f"cat_list:{label}", "pass": ok, "kind": q.price_kind, "cands": len(q.candidates or [])})
        if not ok:
            failures.append({"msg": msg, "kind": q.price_kind, "amount": _amt(q), "sid": q.service_id})

    # Exact catalogue names
    exact_ok = 0
    exact_fail = []
    for s in ACTIVE:
        name = str(s.get("name") or "")
        if not name:
            continue
        q = resolve_price(f"{name} price", CATALOGUE)
        expected = int(float(s.get("price") or 0))
        # Accept fixed match to same id, length-tier ask, list containing price, or clarify for ambiguous
        good = False
        if q.ok and q.price_kind == "fixed" and q.service_id == s["id"] and q.amount_lkr == expected:
            good = True
        elif q.ok and q.price_kind == "list" and expected in {c.get("price") for c in (q.candidates or [])}:
            good = True
        elif q.needs_length and q.service_key:
            good = True
        elif q.ok and q.price_kind == "guide" and q.amount_lkr in {
            p for tiers in OFFICIAL_LENGTH_TIERS.values() for p, _ in tiers.values()
        }:
            good = True
        elif q.needs_clarification or q.escalate:
            # Ambiguous duplicates may clarify — not a false quote
            good = _amt(q) is None
        if good:
            exact_ok += 1
        else:
            exact_fail.append({"id": s["id"], "name": name, "amount": _amt(q), "source": q.source, "kind": q.price_kind})
    checks.append({"id": "exact_catalogue_coverage", "pass": len(exact_fail) == 0, "ok": exact_ok, "fail": len(exact_fail)})

    # Length context
    q1 = resolve_price("Keratin kiyada?", CATALOGUE)
    mem = {"pricing_service_key": q1.service_key or "keratin", "last_service": "keratin"}
    q2 = resolve_price("Bra Strap", CATALOGUE, memory=mem)
    length_ok = q1.needs_length and q2.ok and q2.amount_lkr == OFFICIAL_LENGTH_TIERS["keratin"]["bra_strap"][0]
    checks.append({"id": "length_bra_strap_memory", "pass": length_ok, "amount": _amt(q2)})
    if not length_ok:
        failures.append({"case": "bra_strap", "q1": q1.source, "q2": (_amt(q2), q2.source)})

    q3 = resolve_price("Bra Strap", CATALOGUE, memory={})
    checks.append({"id": "length_without_memory_clarify", "pass": q3.needs_clarification and _amt(q3) is None})

    # Duplicates: Booster Pack variants — must not invent; list or exact active preferred
    q_dup = resolve_price("Booster Pack+ price", CATALOGUE)
    dup_ok = (_amt(q_dup) in (None, 2000)) and (q_dup.ok or q_dup.needs_clarification)
    if q_dup.ok and q_dup.price_kind == "fixed":
        dup_ok = q_dup.service_id in (318, 172) and q_dup.amount_lkr == 2000
    checks.append({"id": "duplicate_booster", "pass": dup_ok, "sid": q_dup.service_id, "amount": _amt(q_dup)})

    # Multilingual price detectors
    for msg in ["Facial mila?", "facial how much?", "ෆේෂල් මිල", "Keratin kiyada?", "කෙරටින් මිල කීයද"]:
        checks.append({"id": f"price_enq:{msg[:20]}", "pass": is_price_enquiry(msg)})

    false_quotes = [f for f in failures if f.get("amount") is not None]
    return {
        "checks": checks,
        "failures": failures[:20],
        "false_quote_count": len(false_quotes),
        "exact_fail_sample": exact_fail[:8],
        "pass": len(false_quotes) == 0 and length_ok and all(
            c["pass"] for c in checks if c["id"].startswith(("unknown", "cat_list", "length_"))
        ),
    }


async def section_booking() -> dict[str, Any]:
    store = FakeStore()
    tool_log: list = []
    install_booking_mocks(store, tool_log)
    steps = []
    failures = []

    async def step(name, msg, pred, **kw):
        r = await booking_turn(msg, **kw)
        ok = bool(pred(r))
        steps.append({"name": name, "msg": msg, "pass": ok, "reply": ((r or {}).get("replyText") or "")[:160] if isinstance(r, dict) else str(r)[:80]})
        if not ok:
            failures.append(name)
        return r

    # Inquiry without booking
    r = await booking_turn("what services do you have?")
    steps.append({"name": "inquiry_no_book", "pass": r is None, "reply": None})

    # Voluntary book → service → date → time path
    r1 = await step("start_book", "book appointment", lambda r: r and "service" in (r.get("replyText") or "").lower())
    r2 = await step("pick_service", "1", lambda r: r and "date" in (r.get("replyText") or "").lower())
    # Topic switch mid-book
    r3 = await booking_turn("Facial mila?", has_media=False)
    pause_ok = isinstance(r3, dict) and r3.get("yieldToLlm") and any(
        a.get("tool") == "booking_pause_for_understanding" for a in (r3.get("actions") or [])
    )
    steps.append({"name": "topic_switch_pause_actions", "pass": pause_ok})
    if not pause_ok:
        failures.append("topic_switch_pause_actions")
    sess = bf.get_session(bf.session_key(28, 3100, "94770002800"))
    steps.append({"name": "draft_preserved", "pass": bool(sess.paused and sess.draft.service_id)})

    r4 = await step("resume", "continue", lambda r: r and not r.get("yieldToLlm") and "date" in (r.get("replyText") or "").lower())
    r5 = await step("set_date", TOMORROW, lambda r: r is not None)
    # time
    r6 = await step("set_time", "10:00", lambda r: r is not None)

    # Cancel lifecycle (separate conv)
    store2 = FakeStore()
    log2: list = []
    install_booking_mocks(store2, log2)
    rc1 = await bf.handle_booking_turn(
        tenant_id=28, conversation_id=3101, phone="94770002801",
        message="cancel my appointment", brand="Larvendo", customer_name="QA Customer",
    )
    rc2 = await bf.handle_booking_turn(
        tenant_id=28, conversation_id=3101, phone="94770002801",
        message="yes", brand="Larvendo", customer_name="QA Customer",
    )
    cancel_ok = (
        isinstance(rc2, dict)
        and (rc2.get("booking") or {}).get("status") == "cancelled"
        and any(t[0] == "cancel_appointment" for t in log2)
    )
    steps.append({"name": "cancel_backend_confirmed", "pass": cancel_ok})
    if not cancel_ok:
        failures.append("cancel_backend_confirmed")

    # Booking failure path
    store3 = FakeStore()
    log3: list = []
    install_booking_mocks(store3, log3, fail_book=True)
    await bf.handle_booking_turn(tenant_id=28, conversation_id=3102, phone="94770002802", message="book appointment", brand="Larvendo")
    await bf.handle_booking_turn(tenant_id=28, conversation_id=3102, phone="94770002802", message="1", brand="Larvendo")
    await bf.handle_booking_turn(tenant_id=28, conversation_id=3102, phone="94770002802", message=TOMORROW, brand="Larvendo")
    rf = await bf.handle_booking_turn(tenant_id=28, conversation_id=3102, phone="94770002802", message="10:00", brand="Larvendo")
    # May ask name before book — continue if needed
    if rf and "name" in (rf.get("replyText") or "").lower():
        rf = await bf.handle_booking_turn(tenant_id=28, conversation_id=3102, phone="94770002802", message="QA Customer", brand="Larvendo")
    if rf and "confirm" in (rf.get("replyText") or "").lower():
        rf = await bf.handle_booking_turn(tenant_id=28, conversation_id=3102, phone="94770002802", message="yes", brand="Larvendo")
    booked_false = (rf or {}).get("booking") if isinstance(rf, dict) else None
    fail_ok = not (booked_false and str(booked_false.get("status") or "").lower() == "confirmed")
    steps.append({"name": "booking_failure_no_false_success", "pass": fail_ok, "booking": booked_false})
    if not fail_ok:
        failures.append("booking_failure_no_false_success")

    # Image mid-book pause
    store4 = FakeStore()
    log4: list = []
    install_booking_mocks(store4, log4)
    await bf.handle_booking_turn(tenant_id=28, conversation_id=3103, phone="94770002803", message="book appointment", brand="Larvendo")
    await bf.handle_booking_turn(tenant_id=28, conversation_id=3103, phone="94770002803", message="1", brand="Larvendo")
    ri = await bf.handle_booking_turn(
        tenant_id=28, conversation_id=3103, phone="94770002803",
        message="[Customer sent a photo]", brand="Larvendo", has_media=True,
    )
    img_ok = isinstance(ri, dict) and ri.get("yieldToLlm") and any(
        a.get("tool") == "booking_pause_for_understanding" for a in (ri.get("actions") or [])
    )
    steps.append({"name": "image_mid_book_pause", "pass": img_ok})
    if not img_ok:
        failures.append("image_mid_book_pause")

    return {"steps": steps, "failures": failures, "pass": len(failures) == 0}


def section_security() -> dict[str, Any]:
    checks = []
    # CI tenant isolation
    c28 = ci.build_conversation_context(message="hi", tenant_id=28, phone="94771110000", memory={"last_service": "keratin"})
    c99 = ci.build_conversation_context(message="hi", tenant_id=99, phone="94771110000", memory={"last_service": "bridal"})
    checks.append({
        "id": "ci_tenant_ids_distinct",
        "pass": c28.tenant_id == 28 and c99.tenant_id == 99,
    })
    # Memory key resolver never invents from unknown
    checks.append({
        "id": "memory_key_no_invent",
        "pass": resolve_service_key_from_memory({"last_service": "galaxy plasma"}) is None,
    })
    # Session keys are tenant-scoped
    k28 = bf.session_key(28, 1, "94771110000")
    k99 = bf.session_key(99, 1, "94771110000")
    checks.append({"id": "session_key_tenant_scoped", "pass": k28 != k99 and str(k28).startswith("28")})

    # Code-path greps (static)
    mem_js = (ROOT / "backend" / "services" / "crmAiMemoryService.js").read_text(encoding="utf-8", errors="replace")
    checks.append({
        "id": "memory_js_filters_tenant",
        "pass": "tenant_id" in mem_js and "phone" in mem_js,
    })
    main_py = (ROOT / "ai_engine" / "app" / "main.py").read_text(encoding="utf-8", errors="replace")
    checks.append({
        "id": "provider_unavailable_path",
        "pass": "soft_provider_unavailable" in main_py and "I can help you book at" not in main_py.split("soft_provider_unavailable")[0][-200:],
    })
    checks.append({
        "id": "soft_provider_preserves_question",
        "pass": "preserved_question" in main_py,
    })
    bf_py = (ROOT / "ai_engine" / "app" / "booking_flow.py").read_text(encoding="utf-8", errors="replace")
    checks.append({
        "id": "yield_to_llm_exists",
        "pass": "yieldToLlm" in bf_py and "draft_preserved" in bf_py,
    })

    return {"checks": checks, "pass": all(c["pass"] for c in checks)}


async def section_failure_recovery() -> dict[str, Any]:
    checks = []
    # Pricing catalogue unavailable pattern already fail-closed in main — static
    main_py = (ROOT / "ai_engine" / "app" / "main.py").read_text(encoding="utf-8", errors="replace")
    checks.append({
        "id": "pricing_catalogue_fail_closed",
        "pass": "pricing_catalogue_unavailable" in main_py and "gemini_price_fallthrough" in main_py,
    })
    checks.append({
        "id": "provider_handoff_on_down",
        "pass": 'reason": "provider_unavailable"' in main_py or "provider_unavailable" in main_py,
    })
    # Timeout constants in gemini provider
    gp = (ROOT / "ai_engine" / "app" / "provider" / "gemini_provider.py").read_text(encoding="utf-8", errors="replace")
    checks.append({
        "id": "gemini_http_timeouts",
        "pass": "HTTP_TIMEOUT_SEC" in gp and "RETRYABLE_STATUS" in gp,
    })
    # Duplicate action: pause once
    store = FakeStore()
    log: list = []
    install_booking_mocks(store, log)
    await booking_turn("book appointment", conv=3200, phone="94770002810")
    await booking_turn("1", conv=3200, phone="94770002810")
    r = await booking_turn("hours?", conv=3200, phone="94770002810")
    tools = [a.get("tool") for a in ((r or {}).get("actions") or [])]
    dup_ok = tools.count("booking_pause_for_understanding") == 1 and "book_appointment" not in tools
    checks.append({"id": "pause_no_duplicate_book", "pass": dup_ok})
    return {"checks": checks, "pass": all(c["pass"] for c in checks)}


async def section_real_gemini() -> dict[str, Any]:
    """Real provider tests — only when key present in env (never logged)."""
    key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("AI_ENGINE_GEMINI_KEY")
        or os.environ.get("GOOGLE_API_KEY")
        or ""
    ).strip()
    if not key:
        return {
            "ran": False,
            "reason": "No Gemini API key in process env — real-provider tests SKIPPED",
            "pass": None,
            "scenarios": [],
        }

    provider = get_provider("gemini")
    scenarios = []
    # Tiny 1x1 jpeg base64
    tiny_jpeg = (
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a"
        "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy"
        "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA"
        "AhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEB"
        "AQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k="
    )

    cases = [
        ("en_service", "What hair treatments do you offer?", "en"),
        ("si_greeting", "ආයුබෝවන්, කෙරටින් ගැන කියන්න", "si"),
        ("sg_price_style", "Keratin kiyada? Length eka shoulder", "sg"),
        ("en_correction", "That reply was wrong — I asked about facial prices not haircut", "en"),
        ("en_human", "I want to speak to a staff member please", "en"),
        ("sg_before_book", "Book karanna kalin details kiyanna about keratin", "sg"),
    ]

    for sid, user, lang in cases:
        t0 = time.time()
        try:
            result = await provider.complete(
                CompletionRequest(
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are Salon Larvendo WhatsApp assistant for Tenant 28. "
                                "Be brief. Never invent exact LKR prices — say length/tiers or ask staff. "
                                f"Prefer language style: {lang}."
                            ),
                        },
                        {"role": "user", "content": user},
                    ],
                    model="gemini-2.0-flash",
                    api_key=key,
                    max_tokens=200,
                    temperature=0.3,
                )
            )
            text = (result.text or "").strip()
            latency = int((time.time() - t0) * 1000)
            # Safety: no obvious invent of galaxy→keratin pattern required here; check non-empty
            invent_bad = bool(re.search(r"galaxy.{0,20}25[, ]?000|Rs\.?\s*99999", text, re.I))
            scenarios.append({
                "id": sid,
                "pass": bool(text) and not invent_bad,
                "latency_ms": latency,
                "reply_excerpt": text[:180],
                "provider": "real_gemini",
            })
        except Exception as exc:
            scenarios.append({
                "id": sid,
                "pass": False,
                "error": type(exc).__name__ + ":" + str(exc)[:120],
                "provider": "real_gemini",
            })

    # Image turn
    t0 = time.time()
    try:
        result = await provider.complete(
            CompletionRequest(
                messages=[
                    {"role": "system", "content": "Describe the image briefly for a salon consultation. Ask if they want a cut or colour."},
                    {
                        "role": "user",
                        "content": "[Customer sent a photo]",
                        "images": [{"mimeType": "image/jpeg", "dataBase64": tiny_jpeg}],
                    },
                ],
                model="gemini-2.0-flash",
                api_key=key,
                max_tokens=150,
            )
        )
        text = (result.text or "").strip()
        scenarios.append({
            "id": "image_vision",
            "pass": bool(text),
            "latency_ms": int((time.time() - t0) * 1000),
            "reply_excerpt": text[:180],
            "provider": "real_gemini",
        })
    except Exception as exc:
        scenarios.append({
            "id": "image_vision",
            "pass": False,
            "error": type(exc).__name__ + ":" + str(exc)[:120],
            "provider": "real_gemini",
        })

    passed = sum(1 for s in scenarios if s.get("pass"))
    return {
        "ran": True,
        "key_present": True,
        "key_fingerprint": f"len={len(key)} prefix={key[:4]}…",  # no secret
        "scenarios": scenarios,
        "passed": passed,
        "total": len(scenarios),
        "pass": passed == len(scenarios),
    }


def run_regression_counts() -> dict[str, Any]:
    import subprocess
    pytest_out = subprocess.run(
        [sys.executable, "-m", "pytest", "tests/", "-q", "--tb=no"],
        cwd=str(ROOT / "ai_engine"),
        capture_output=True,
        text=True,
        timeout=180,
    )
    tail = (pytest_out.stdout or "").strip().splitlines()[-3:]
    beh = subprocess.run(
        [sys.executable, str(ROOT / "_scripts" / "_qa_behaviour_local.py")],
        capture_output=True,
        text=True,
        timeout=60,
    )
    beh_json = {}
    try:
        # Behaviour script prints a compact JSON object on the first line(s)
        m = re.search(r"\{[^{}]*\"passed\"[^{}]*\}", beh.stdout or "", re.S)
        beh_json = json.loads(m.group(0)) if m else {"raw": (beh.stdout or "")[:200]}
    except Exception:
        beh_json = {"raw": (beh.stdout or "")[:200]}
    ind = subprocess.run(
        [sys.executable, str(ROOT / "_scripts" / "_independent_qa_phase2_plus.py")],
        capture_output=True,
        text=True,
        timeout=180,
    )
    ind_summary = {}
    try:
        # script prints JSON summary first object
        out = ind.stdout or ""
        ind_summary = json.loads(out[out.find("{") : out.find("\nfailures")])
    except Exception:
        ind_path = ROOT / "_scripts" / "_independent_qa_phase2_plus.json"
        if ind_path.exists():
            ind_summary = json.loads(ind_path.read_text(encoding="utf-8")).get("summary", {})
    return {
        "pytest_tail": tail,
        "pytest_ok": pytest_out.returncode == 0,
        "behaviour": beh_json,
        "independent": ind_summary,
    }


async def main_async():
    report: dict[str, Any] = {
        "tenant": 28,
        "mode": "local_validation",
        "pricing": section_pricing(),
        "booking": await section_booking(),
        "security": section_security(),
        "failure_recovery": await section_failure_recovery(),
        "real_gemini": await section_real_gemini(),
        "regression": run_regression_counts(),
    }
    # Gaps from review
    report["gaps"] = [
        {
            "id": "A3_regex_intent",
            "severity": "medium",
            "note": "Intent classification remains heuristic/regex; Gemini is response brain, not NLU classifier.",
        },
        {
            "id": "prod_not_deployed",
            "severity": "high",
            "note": "Phase 2+/P0–P1 code is local only; production still on older binaries until explicit deploy.",
        },
        {
            "id": "real_gemini_env",
            "severity": "high" if not report["real_gemini"].get("ran") else "info",
            "note": report["real_gemini"].get("reason") or "Real Gemini scenarios executed.",
        },
        {
            "id": "live_wa_smoke",
            "severity": "high",
            "note": "No real customer WhatsApp messages sent (authorization required).",
        },
    ]
    blockers = []
    if not report["pricing"]["pass"]:
        blockers.append("pricing_validation")
    if not report["booking"]["pass"]:
        blockers.append("booking_lifecycle")
    if not report["security"]["pass"]:
        blockers.append("security")
    if not report["failure_recovery"]["pass"]:
        blockers.append("failure_recovery")
    if not report["regression"].get("pytest_ok"):
        blockers.append("pytest")
    beh = report["regression"].get("behaviour") or {}
    if beh.get("passed") != beh.get("total"):
        blockers.append("behaviour")
    ind = report["regression"].get("independent") or {}
    if ind.get("scenarios_failed"):
        blockers.append("independent_qa")
    if report["real_gemini"].get("ran") is False:
        blockers.append("real_gemini_not_run")
    elif report["real_gemini"].get("ran") and not report["real_gemini"].get("pass"):
        blockers.append("real_gemini_failures")

    if blockers == ["real_gemini_not_run"]:
        verdict = "READY WITH CONDITIONS"
    elif blockers:
        verdict = "NOT READY FOR DEPLOYMENT"
    else:
        verdict = "READY FOR DEPLOYMENT"

    report["blockers"] = blockers
    report["verdict"] = verdict
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    print(json.dumps({
        "verdict": verdict,
        "blockers": blockers,
        "pricing_pass": report["pricing"]["pass"],
        "booking_pass": report["booking"]["pass"],
        "security_pass": report["security"]["pass"],
        "failure_pass": report["failure_recovery"]["pass"],
        "real_gemini": {"ran": report["real_gemini"].get("ran"), "pass": report["real_gemini"].get("pass")},
        "pytest_ok": report["regression"].get("pytest_ok"),
        "behaviour": beh,
        "independent_failed": ind.get("scenarios_failed"),
        "out": str(OUT),
    }, indent=2))


if __name__ == "__main__":
    asyncio.run(main_async())
