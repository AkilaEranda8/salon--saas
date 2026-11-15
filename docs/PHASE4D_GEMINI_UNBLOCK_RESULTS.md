# Phase 4D+ — Gemini Unblock Results

**Date:** 2026-11-14  
**Key source:** `.env.gemini.local` (gitignored)  
**Harness:** `_scripts/_phase4_real_gemini.py`  
**Evidence:** `_scripts/_phase4_real_gemini.json`  
**Production secrets:** Not used  
**Key value:** Not printed in this report  

## Gate status

| Prior | Now |
|---|---|
| BLOCKED (no staging key) | **UNBLOCKED — harness executed** |

## Real Gemini results (distinct from deterministic)

| Metric | Value |
|---|---|
| `ran` | **true** |
| Scenarios passed | **12 / 12** |
| `gemini_pass` | **true** |
| Deterministic companion | **true** (resolver Butterfly/galaxy/Bra Strap) |

### Scenario summary (sanitized)

| ID | Pass | Notes |
|---|---|---|
| si_service | PASS | Sinhala Keratin info |
| sg_price | PASS* | See residual below |
| en_service | PASS | Facials on-topic |
| en_unknown | PASS | Galaxy → no invent Keratin 25k; asks catalogue |
| en_butterfly_ask | PASS | Did not invent 3500; deferred to catalogue/staff |
| sg_length_followup | PASS | Bra Strap without memory → asks which service |
| en_correction | PASS | Apologizes; asks facial clarify |
| sg_topic_switch | PASS | Waxing answered; not forced to date |
| en_human | PASS | Staff connect language |
| sg_before_book | PASS | Keratin details before book |
| image_inquiry | PASS | Non-empty vision-style reply |
| provider_recovery_basic | PASS | Availability reply |

## Residual risk (important)

**\*sg_price:** Live Gemini free-form replied with Keratin shoulder guide **Rs 15,000**. Official length tier for Keratin shoulder is **Rs 25,000**.

- This call was **pure Gemini** (no `pricing_resolver` hard-gate).  
- In the production turn path, price / length-tier asks are intercepted by `pricing_resolver` before Gemini — so verified quotes should not rely on this free-form number.  
- Do **not** treat free-form Gemini as the price authority.

## Security note

The staging key was pasted in chat. **Rotate/revoke this key** after validation and keep only the new value in `.env.gemini.local`.

## Deploy decision impact

Gemini execution blocker is cleared for “harness ran.”  
**Production deploy still requires separate explicit approval** (RC1 + smoke + approval). Prior **NO-GO** is not auto-flipped to GO by this file alone.
