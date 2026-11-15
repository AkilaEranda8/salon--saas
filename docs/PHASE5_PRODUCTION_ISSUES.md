# Phase 5 — Production Issues Log

**Tenant:** 28  
**Release:** RC2  
**Smoke evidence:** `_scripts/_phase5_wa_smoke_evidence.json`  

## Critical (stop-the-line)

None remaining after full 12/12 PASS.

| ID | Finding | Severity | Status |
|---|---|---|---|
| P5-0 | Initial cancel harness flagged CRITICAL when AI asked which appointment after `yes` (word “cancel” in prompt ≠ success). | N/A (harness false positive) | Cleared — retest PASS with DB `cancelled` on #146 |

## Non-critical / observations

| ID | Finding | Severity | Notes |
|---|---|---|---|
| P5-1 | English “What facials do you offer?” returned catalogue-clarify style reply rather than a full facial list. | LOW | Scenario still PASS on cue match; product polish opportunity |
| P5-2 | Image smoke used 1×1 blank JPEG → AI correctly said photo blank / ask clearer. | LOW | Expected for synthetic image fixture |
| P5-3 | Booking used remembered customer name “Hexalyte Innovation - Akila” instead of typed “Phase5 Smoke Test”. | LOW | DB confirmation still valid (#146) |
| P5-4 | Two confirmed appointments (#145, #146) required numeric selection to cancel. | INFO | Correct safety behaviour |
| P5-5 | Appointment #145 left `confirmed` after smoke (not selected for cancel). | INFO | Operator may cancel manually if undesired |

## Pricing / tenant / duplicate

| Check | Result |
|---|---|
| False official price | **None observed** |
| Cross-tenant leakage | **None** (conv + appts tenant_id 28) |
| Duplicate outbound on same waMessageId | **None** (count=1) |
| False booking success | **None** (#146 confirmed in DB) |
| False cancel success | **None** on final path (#146 cancelled in DB) |
