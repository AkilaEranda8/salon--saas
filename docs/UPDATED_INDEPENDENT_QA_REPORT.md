# Updated Independent QA Report — Post P0/P1 Fixes (Larvendo T28)

**Date:** 2026-11-14  
**Mode:** Local assessment after pricing / length / provider / pause fixes  
**Evidence:** `_scripts/_independent_qa_phase2_plus.json`  
**No production changes.**

## Executive verdict

**LOCAL QUALITY GATE: PASS** (with known residual: intent classifier remains regex-CI, not Gemini NLU).  
**PRODUCTION DEPLOY:** still requires **separate explicit approval** + live WA smoke.

| Metric | Value |
|---|---|
| Independent scenarios | **12/12** |
| Avg relevance (stub Gemini free-form) | **0.904** |
| Architecture | **7/8** (A3 regex-CI expected gap) |
| Pytest | **480 passed** |
| Behaviour | **17/17** |
| Pricing false-quote (galaxy→Keratin) | **BLOCKED** |
| Length-only bypass | **FIXED** (resolver + memory) |
| Provider-down say-book | **FIXED** |
| Pause actions on yield | **FIXED** |

## Stub vs real Gemini

| Layer | Type | Notes |
|---|---|---|
| Independent QA free-form turns | **Stub** `CaptureProvider` | Relevance scores are stub-shaped; proves wiring, not live NLU quality |
| Pricing / booking / cancel paths | **Deterministic** (no LLM) | Hard-gate + SM — production-identical logic |
| `tests/test_real_gemini_optional.py` | **Real provider** | Runs only when `GEMINI_API_KEY` / `AI_ENGINE_GEMINI_KEY` set; otherwise skipped |

## Verification matrix (1–10)

| # | Check | Result |
|---|---|---|
| 1 | Ordered Gemini context | **PASS** |
| 2 | Memory tenant+customer isolation | **PASS** |
| 3 | Latest intent not overridden | **PASS** (local) |
| 4 | Topic switch + correction | **PASS** |
| 5 | Image bytes to Gemini | **PASS** |
| 6 | Pricing no false quote / invent | **PASS** (A5 + S9) |
| 7 | Book/cancel backend confirm | **PASS** (S6) |
| 8 | No generic fallback override | **PASS** (S11 unavailable path) |
| 9 | P0 intact | **PASS** |
| 10 | No cross-tenant leakage | **PASS** (unit) |

## Blocker scenarios (new)

| ID | Result | Customer-facing summary |
|---|---|---|
| S9 galaxy false-quote | PASS | Clarify — not Keratin 25,000 |
| S10 length memory | PASS | Bra Strap → official Keratin tier via resolver |
| S11 provider down | PASS | Unavailable + saved question + staff |
| S12 pause actions | PASS | Photo mid-book includes `booking_pause_for_understanding` |

## Residual risks

1. Intent classification still regex-guided (A3).
2. Live Gemini quality not scored in this harness (stub).
3. Prod binaries still older until deploy.
4. Length follow-up requires inbound to persist `pricing_service_key` (JS patch included in package).
