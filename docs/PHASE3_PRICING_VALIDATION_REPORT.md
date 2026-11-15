# Phase 3 — Pricing & Catalogue Validation (Larvendo T28)

**Date:** 2026-11-14  
**Catalogue source:** `ai_engine/tests/fixtures/t28_services.json` (134 rows / 127 active)  
**Evidence:** `_scripts/_phase3_validation.json` → `pricing`

## Verdict

**PASS** after one Phase-3-discovered fix (Ladies Hair Cut-Butterfly).

| Check | Result |
|---|---|
| Unknown named services → no amount | **0 false quotes** |
| Generic category → list only (no single auto-pick) | **PASS** |
| Keratin → Bra Strap via memory | **Rs 30,000 official tier** |
| Length-only without memory | **Clarify** |
| Exact active catalogue coverage | **127/127** |
| Duplicate Booster Pack+ | **Safe (2000 / clarify)** |
| SI / Singlish / EN price detection | **PASS** |

## Critical finding fixed in Phase 3

| Severity | Issue | Before | After |
|---|---|---|---|
| **High** | `Ladies Hair Cut-Butterfly` (Rs 4500) collapsed via ladies-cut shortcut to `Ladies Hair Cut` (Rs 3500) | False verified quote | Quotes **id 278 / Rs 4500** |

Fix (minimal):  
1. Bare ladies/gents shortcuts only when no extra distinctive tokens.  
2. Multi-match name resolution prefers **longest catalogue name contained** in the ask.

Files: `ai_engine/app/pricing_resolver.py` + test in `test_pricing_false_quote_and_length_context.py`.

## Galaxy / unknown protection (retained)

`Galaxy Plasma Treatment price kiyada?` → clarify, **not** Keratin Rs 25,000.

## Residual notes

- Guide length-tier prices still carry `needs_confirmation` (salon final).
- Prod catalogue must match fixture at deploy time; re-export T28 services if SKUs changed.
