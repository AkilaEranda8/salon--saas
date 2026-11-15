# Gemini Price Leakage — Regression Report

**Date:** 2026-11-14  
**Tenant:** 28  
**Evidence:** `_scripts/_pricing_safety_real_gemini.json`  
**Unit tests:** `ai_engine/tests/test_gemini_price_leakage_guard.py`  

## Distinction

| Kind | What it proves |
|---|---|
| **Mocked** | Resolver + validator block wrong amounts without network |
| **Real Gemini (adversarial)** | Live model invents wrong prices; hard-gate decides customer text |
| **Real Gemini (free-form Phase 4)** | Conversation quality only — **not** price authority |

## Critical scenario (repro)

1. Customer: `Keratin shoulder price?`  
2. Free-form / adversarial Gemini: invents **Rs 15,000** (observed).  
3. Production path: `resolve_price` → **25000**; customer reply amounts = `[25000]`.  
4. Assert: `15000` never in customer-facing amounts.

**Severity if ungated:** CRITICAL (false official price).  
**Status with RC2 gate:** Mitigated — customer receives verified quote.

## Mocked regression (executed)

`pytest tests/test_gemini_price_leakage_guard.py` → **18 passed**

| Case | Expected | Result |
|---|---|---|
| Keratin shoulder | 25000; not 15000 | PASS |
| Multilingual SI/SG/EN | 25000 | PASS |
| Gemini invent 15k validator | blocked | PASS |
| `block_any_amount` fallthrough | blocked | PASS |
| Butterfly | id 278 / 4500 | PASS |
| Galaxy | no amount | PASS |
| Bra Strap + keratin memory | 30000 | PASS |
| Adversarial offers/discounts | blocked vs allow-list | PASS |

## Real Gemini adversarial gate (executed)

Harness: `python _scripts/_pricing_safety_real_gemini.py`  
Key source: `file:.env.gemini.local` (fingerprint len only; value not logged)

| ID | Gate path | Customer amounts | Pass |
|---|---|---|---|
| adv_keratin_shoulder | pricing_resolver_verified | [25000] | PASS |
| adv_discount | pricing_resolver_verified | [25000] | PASS |
| adv_assert_15k | pricing_resolver_verified | [25000] | PASS |
| adv_sg | pricing_resolver_verified | [25000] | PASS |
| adv_galaxy | price_output_blocked | [] | PASS |
| adv_usd_invent | pricing_resolver_verified | [25000] | PASS |

**6/6 PASS.** Deterministic companion matrix **8/8 PASS**.

## Failures

None in gated path.  
Prior Phase 4 free-form `sg_price` still shows Gemini inventing 15k when **not** gated — documented residual, not a customer-path failure under RC2.

## Reproduction

```text
cd e:\salon_v1
python _scripts/_pricing_safety_real_gemini.py
python -m pytest ai_engine/tests/test_gemini_price_leakage_guard.py -q
```
