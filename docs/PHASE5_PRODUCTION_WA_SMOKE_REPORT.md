# Phase 5 — Production WhatsApp Smoke Report

**Project:** Larvendo AI  
**Tenant:** 28 – Salon Larvendo Pvt LTD  
**Release:** RC2 (already deployed)  
**Authorization:** `APPROVED FOR WHATSAPP SMOKE ONLY`  
**Test number:** `947***0063` (conversation `#24`, tenant_id **28**)  
**WA session:** connected  
**Evidence:** `_scripts/_phase5_wa_smoke_evidence.json`  
**Date (UTC):** 2026-11-14  

## Summary

| Metric | Value |
|---|---|
| Scenarios run | **12 / 12** |
| PASS | **12** |
| FAIL | **0** (final) |
| BLOCKED | **0** |
| Ordinary customers messaged | **No** |
| Code/config changes | **None** |
| Service restarts | **None** |

## Scenario results

| # | Scenario | Status | Expected | Actual (sanitized) |
|---|---|---|---|---|
| 1 | Sinhala | **PASS** | SI keratin context | Length ask for Keratin (Shoulder/Bra/Hip) |
| 2 | Singlish | **PASS** | Keratin price → length | Length ask; no Rs 15,000 |
| 3 | English | **PASS** | Facials answer | Soft clarify / catalogue cue (see issues) |
| 4 | Keratin Shoulder Rs 25,000 | **PASS** | Official 25000; no Gemini 15k | `Guide price for Keratin (shoulder): Rs 25,000` |
| 5 | Galaxy | **PASS** | Clarify; no invent | Singlish clarify + *staff*; **no amounts** |
| 6 | Butterfly | **PASS** | Verified cut price | `Ladies Hair Cut-Butterfly: Rs 4,500` |
| 7 | Hair image | **PASS** | Answer image ask | Asked for clearer photo / look (tiny blank JPEG) |
| 8 | Topic switch in booking | **PASS** | Latest ask (facial price) | Verified facial price list mid-flow |
| 9 | Booking | **PASS** | Success only with DB | Appt **#146** `confirmed` tenant 28 |
| 10 | Cancellation | **PASS** | DB cancelled | `#146` → `cancelled` after select `1` + `yes` |
| 11 | Human handoff | **PASS** | Staff path + context | Reply + `status=queued`, `handoff_reason=customer_requested_staff` |
| 12 | Duplicate-send | **PASS** | No duplicate replies | Same `waMessageId` → **1** outbound |

## Critical pricing checks

- Keratin shoulder customer amount: **25000 only** (not 15000).  
- Galaxy: **no** LKR amount.  
- Butterfly: **4500** (not 3500).  

## Execution notes

1. Inbound simulated as test phone via `WA_INBOUND_AI` queue (production Baileys path); replies delivered to authorized test number only.  
2. First cancel attempt used bare `yes` while two appointments existed → AI asked which number (not a false cancel). Retested with `cancel` → `1` → `yes` → DB `cancelled`.  
3. Appointment **#145** remained `confirmed` (not selected); pre-existing / not the Phase5 book target.  

## Boundaries honored

No ordinary customers · no marketing · no code/config deploy · no restarts · no unrelated prod ops.
