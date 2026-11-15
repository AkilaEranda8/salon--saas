# Final Pricing Safety — Implementation Report

**Project:** Larvendo Salon AI  
**Tenant:** 28 – Salon Larvendo Pvt LTD  
**Date:** 2026-11-14  
**Release:** `_release/phase4c_t28_rc2/` (RC1 preserved immutable)  
**Deploy:** NOT EXECUTED  

## Problem

Real Gemini free-form (Phase 4D) answered Keratin shoulder as **Rs 15,000**.  
Official length tier: **Rs 25,000**. Gemini must never authorize official prices.

## Architecture (enforced)

| Layer | Responsibility |
|---|---|
| Gemini | Intent, language, natural wording — **not** official prices |
| `pricing_resolver` | Exact service, length tier, verified LKR or unresolved |
| `main.py` hard gate | Intercepts price asks before Gemini; blocks invented amounts on fallthrough |
| Backend/worker | Booking/cancel truth; memory patch for length follow-ups |

## Code changes (vs RC1)

| File | Change |
|---|---|
| `ai_engine/app/pricing_resolver.py` | Expanded `is_price_enquiry` (assert/deal/discount); `extract_lkr_amounts`; `validate_reply_against_verified_amounts`; `price_output_fallback`; Keratin shoulder remains **25000** |
| `ai_engine/app/main.py` | `_maybe_pricing_resolver_reply` self-repair; post-Gemini `price_output_blocked` on any LKR in price-related fallthrough (also after reply retry) |
| Tests | `tests/test_gemini_price_leakage_guard.py`; intent-matrix allows `price_enquiry\|objection` for “expensive” |

RC1 files under `_release/phase4c_t28_rc1/` were **not** modified (verified sha16 `pricing_resolver` = `f38c616f83ac9873`).

## Hard gate sequence (live path)

1. Detect price ask / length follow-up / assert-price / discount.  
2. Resolve via `resolve_price` + live catalogue (fail-closed if catalogue unavailable).  
3. Customer reply = verified `pick_quote_message` (or clarify / escalate).  
4. If any path still reaches Gemini on a price ask and reply contains Rs/LKR → replace with `price_output_fallback` + `handoff.reason=price_output_blocked`.  
5. Verified amounts are never overwritten by LLM text.

**Design choice:** Verified quotes are returned from the resolver (not re-worded by Gemini). Safer than “Gemini + allow-list” for official numbers.

## Evidence (executed)

| Suite | Result | Notes |
|---|---|---|
| Full pytest | **499 passed**, 1 skipped | Mocked/deterministic |
| Behaviour harness `_qa_behaviour_local.py` | **17/17** | Deterministic |
| Leakage + fallthrough + pricing edge | **162 passed** (subset run) | Mocked |
| Pricing safety real Gemini gate | **8/8 det + 6/6 adv** | `_scripts/_pricing_safety_real_gemini.json` |
| Phase 4 free-form Gemini | Prior **12/12** | Still invents 15k in free-form; **not** customer path |

## Keratin shoulder proof

- Resolver: `Keratin shoulder price?` → `amount_lkr=25000`.  
- Adversarial Gemini invents Rs 15,000 → customer still receives **[25000]** only.  
- Galaxy invents promo amounts → customer `price_output_blocked` with **no** LKR.

## Boundaries respected

Local/staging only · no prod secrets pulled · no deploy · no WA send · no commit/push · keys not logged.

## Residual / conditions

See `FINAL_PRODUCTION_READINESS_REPORT.md`.
