# Phase 3 — Failure Recovery Report (Larvendo T28)

**Date:** 2026-11-14  
**Evidence:** `_scripts/_phase3_validation.json` → `failure_recovery` + independent QA `S11`

## Verdict

**PASS** (local)

| Failure mode | Behaviour | Status |
|---|---|---|
| Pricing catalogue tool down | Fail-closed escalate / handoff — no Gemini invent | Code path present |
| Primary Gemini exception | Failover to alt provider if configured | Code path present |
| Both providers down | `soft_provider_unavailable` — saves question, offers `*staff*`, **no say-book** | Independent QA S11 PASS |
| Gemini HTTP 429/503 | Model fallback + short timeouts (`HTTP_TIMEOUT_SEC`) | Provider constants present |
| Pause during booking | Actions persisted via `yieldToLlm`; no duplicate `book_appointment` | PASS |
| Booking slot failure | No false `confirmed` booking | PASS |

## Customer-facing provider-down contract

- States temporary unavailability  
- Echoes preserved question snippet  
- Retry or human handoff  
- Does **not** claim the enquiry was answered  
- Does **not** force booking SM on free-form asks  

## Residual

- Live timeout/latency under real Gemini load not measured (no local key).
- Ops should alert on elevated `soft_provider_unavailable` / failover rates post-deploy.
