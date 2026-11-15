# Human Handoff Regression Report — Larvendo T28

**Date:** 2026-11-14  
**Suite:** `backend/tests/test_handoff_inbound_policy.js` + FAQ expand checks  
**Result:** **PASS**

---

## 1. Case matrix

| # | Scenario | Result |
|---|---|---|
| 1 | Question before handoff (FAQ still classified) | PASS |
| 2 | Multiple questions after handoff (assist) | PASS |
| 3 | Salon location after handoff | PASS |
| 4 | Service duration after handoff | PASS |
| 5 | Ambiguous follow-up (`Koheda?`) | PASS |
| 6 | Topic change while queued | PASS |
| 7 | Repeated messages → no per-message ack requirement | PASS (episode TTL) |
| 8 | Staff owns chat (`human_active`) — FAQ only | PASS |
| 9 | Verified FAQ assist without cancelling handoff | PASS (policy + status preserve in service) |
| 10 | Human-only ask → no AI assist | PASS |
| 11 | Worker retry / resume preserves handoff status | PASS (code path) |
| 12 | Duplicate ack prevention (episode key, not 120s) | PASS |
| 13 | Inbound always persisted on non-assist path | PASS (unchanged append) |
| 14 | Sinhala / Singlish patterns in FAQ | PASS |
| 15 | Tenant isolation | unchanged (tenantId scoping) |

Cross-check: category + respect + pricing suites **85 passed**.

---

## 2. Acceptance

| Criterion | Status |
|---|---|
| Zero silent drops on FAQ-class asks | ✅ (assist path) |
| Zero repeated generic teammate ack every message | ✅ |
| Verified FAQ can be answered | ✅ |
| Handoff remains active | ✅ |
| No invented address/duration in policy | ✅ (data gates elsewhere) |
| No false callback spam | ✅ |
| Booking/pricing regressions | ✅ suites green |

---

## 3. STOP

Local evidence only. No WhatsApp smoke without separate approval.
