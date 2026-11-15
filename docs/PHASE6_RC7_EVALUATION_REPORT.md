# Phase 6 RC7 — Evaluation Report

**Candidate:** `phase6_t28_rc7`  
**Evidence:** `_scripts/_eval_rc7_results.json`  
**WhatsApp:** NOT SENT  

## Offline (deterministic intelligence layers) — 10/10

| Case | Result |
|------|--------|
| Short fragment `eka` | topic=keratin via referent |
| Multi-question | ≥2 ask units + planner tools |
| Correction | intent=correction |
| Topic switch | stale blocked / new topic |
| Price objection | alternative_request |
| Singlish slot ask | implicit/book path |
| Sinhala price | classified |
| Handoff | human_handoff path |
| Fake book probe | quality fail |
| Media claim probe | media_claim_without_media |

## Live Gemini (local API only) — 6/6

Provider smoke (no catalogue tools, no WA):

| Case | Latency ms | Tokens (p/c) | Notes |
|------|------------|--------------|-------|
| frag_short | ~1892 | 29/25 | Reply OK; without CI context language may drift |
| multi_q | ~1579 | 39/53 | Answered both asks in one reply |
| correction | ~1450 | 35/25 | Acknowledged keratin correction |
| topic_switch | ~1700 | 33/57 | Bridal topic engaged |
| price_obj | ~1978 | 45/59 | Soft alternative tone |
| singlish | ~1555 | 37/25 | Slot-style reply |

**Honest limitation:** Raw Gemini without `turns()` gates can invent branch/city. Production path still hard-gates prices/bookings via `pricing_resolver` + `booking_flow` + `response_quality`. Full-stack staging WA eval requires separate approval.

## Unit tests

`test_rc7_autonomous_intelligence.py` + extended quality tests → **13 passed**
