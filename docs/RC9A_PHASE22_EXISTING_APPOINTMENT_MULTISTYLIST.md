# HEXALYTE LARVENDO — RC9a PHASE 2.2  
# Existing Appointment Management & Multi-Stylist Conversation

**Date:** 2026-11-17  
**Scope:** Local RC9a candidate only  
**Prior:** Extended Reliability · Phase 2 · Phase 2.1 MySQL Transaction Validation  
**Constraints:** No production / no live WhatsApp / no live Gemini / no deploy / no restart / no commit / no push / `H_CALTE_ENABLED=false` / no H-CALTE P1 / immutable snapshots preserved.

**Does not claim full production readiness.**

---

## Classification legend

| Label | Meaning |
|-------|---------|
| **Implemented and MySQL-tested** | Real disposable MySQL proof |
| **Implemented and fixture-tested** | In-memory / mock / pytest |
| **Partially tested** | Present; coverage incomplete |
| **Not implemented** | Absent |
| **Unverified** | Exists but not validated here |

---

## 1. Real MySQL results

Harness: `crmAddServicesMysqlRc9aPhase22.test.js` against `rc9a_phase22_test` on `:3307` — **11/11 pass**.

| Scenario | Result | Classification |
|----------|--------|----------------|
| Create then add service; **same appointment id** | PASS (amount 5500, sequential 09:00→09:45) | Implemented and MySQL-tested |
| Duplicate service → `DUPLICATE_SERVICE` | PASS | Implemented and MySQL-tested |
| Add-services idempotent replay | PASS | Implemented and MySQL-tested |
| Cross-tenant access → NOT_FOUND | PASS | Implemented and MySQL-tested |
| Multi-stylist create (cut + wax different staff) | PASS | Implemented and MySQL-tested |
| Line staff off-day blocks create | PASS | Implemented and MySQL-tested |
| Add-services forced link failure rollback | PASS (amount/links unchanged) | Implemented and MySQL-tested |
| Per-line overlap unit filter | PASS | Implemented and fixture-tested |

Endpoint: `POST /api/crm-integration/appointments/:id/services`  
Service: `crmAppointmentAddServicesService.js`  
AI confirm policy: `customer_notify: deferred_to_ai_turn` — never silent mutate without explicit customer yes in booking_flow.

---

## 2. Redis integration results

Harness: `crmIntegrationExpressE2eRc9aPhase22.test.js` with `REDIS_URL=redis://127.0.0.1:6380` — **9/9 pass**.

| Check | Result |
|-------|--------|
| Create with `idempotency_key` → 201 | PASS |
| Duplicate create → 200 `idempotent: true` same id | PASS |
| Appointment count remains 1 | PASS |
| Redis SET NX + DB notes marker together | Exercised via controller path |

**Classification:** Implemented and MySQL-tested (with Redis).

---

## 3. Express controller E2E results

| Case | HTTP | Result |
|------|------|--------|
| Invalid service key | 401 | PASS |
| Missing tenant | 400 | PASS |
| Valid auth list services | 200 | PASS |
| Create appointment | 201 | PASS |
| Add services | 200 | PASS |
| Cross-tenant add | 404 | PASS |
| Retry after forced txn failure | no orphans + idempotent retry | PASS |

**Classification:** Implemented and MySQL-tested.

---

## 4. Multi-stylist booking results

| Capability | Status |
|------------|--------|
| Draft `service_staff` / per-line staff | Implemented |
| CRM create accepts `service_staff` | Implemented and MySQL-tested |
| Specialist required → `AWAIT_LINE_STAFF` (no silent pick) | Implemented and fixture-tested |
| “Mata wena stylist kenek oni” | Implemented and fixture-tested |
| Book payload includes `service_staff` | Implemented and fixture-tested |
| Live WhatsApp multi-stylist E2E | Unverified (disabled) |

**Classification:** Implemented and MySQL-tested (persist); conversation fixture-tested.

---

## 5. Per-line availability results

| Check | Result |
|-------|--------|
| `validatePerLineAvailability` | Each line vs own staff window + blocks |
| `filterStartsForPerLineStaff` | Candidate starts filtered; never invents |
| Create path uses per-line validation | Wired in `crmAppointmentCreateService` |
| Add-services rechecks all lines (excl. self) | Wired |
| Off-day on secondary stylist | MySQL PASS |
| Overlap on secondary stylist | Unit PASS |

**Classification:** Implemented and MySQL-tested.

---

## 6. Existing appointment update results

| Rule | Result |
|------|--------|
| Tenant-scoped lookup | PASS |
| Status gate (confirmed/pending) | Implemented |
| Preserve appointment reference | PASS |
| Catalogue validation | PASS |
| Prevent duplicate mappings | PASS |
| Recalc amount/duration | PASS |
| Availability / hours recheck | PASS |
| Transactional writes + rollback | PASS |
| Explicit customer confirm before commit | booking_flow ADD_SVC confirm | Fixture-tested |
| Silent change of original booking | Forbidden | |

**Classification:** Implemented and MySQL-tested (API); conversation fixture-tested.

---

## 7. Conversation regression results

`tests/test_rc9a_phase22_conversation_regression.py` — **10/10 pass**.

| Phrase / behaviour | Result |
|--------------------|--------|
| Eka ekath add / Kalin booking… | Intent `add_services` |
| 11 walata change karanna | Sets time 11:00; no book yet |
| Cancel this | Intent cancel |
| Eka epa, anith eka thiyanna | Drops extra; keeps primary |
| Mata wena stylist kenek oni | Asks stylist list; no invent |
| Hari ehema karamu | Does not invent ref without confirm path |
| Book / yes after confirm | Backend success required before ref |
| Never confirm before backend | PASS |

**Classification:** Implemented and fixture-tested. Live multilingual WA **Unverified**.

---

## 8. Modified files

| File | Role |
|------|------|
| `backend/services/crmAppointmentAddServicesService.js` | Add-services transactional core |
| `backend/services/crmAppointmentCreateService.js` | Per-line availability on create |
| `backend/services/crmMultiServiceBooking.js` | `validatePerLineAvailability`, `filterStartsForPerLineStaff` |
| `backend/controllers/crmIntegrationController.js` | `addAppointmentServices` |
| `backend/routes/crmIntegration.js` | Route wire-up |
| `backend/services/__tests__/crmAddServicesMysqlRc9aPhase22.test.js` | MySQL harness |
| `backend/services/__tests__/crmIntegrationExpressE2eRc9aPhase22.test.js` | Express+Redis E2E |
| `ai_engine/app/booking_multistylist.py` | Intent + draft staff helpers |
| `ai_engine/app/booking_flow.py` | Add-svc / line-staff / confirm gates |
| `ai_engine/app/tools/salon_client.py` + `__init__.py` | `add_appointment_services` tool |
| `ai_engine/tests/test_rc9a_phase22_conversation_regression.py` | Regression |
| `docs/RC9A_PHASE22_EXISTING_APPOINTMENT_MULTISTYLIST.md` | This report |
| `docs/RC9A_PHASE21_ADD_SERVICES_API_CONTRACT.md` | Marked implemented |

---

## 9. Remaining limitations

1. **Not production-ready** — local disposable DB/Redis only.
2. Multi-stylist **slot listing** still primarily probes header staff then filters; full multi-calendar UI not shipped.
3. Add-services does not yet prompt per-line stylist in WhatsApp when adding to existing (uses header / optional `service_staff`).
4. No live Gemini / WhatsApp evaluation (by design this phase).
5. Redis lock race under multi-process load not soak-tested.
6. Cancelled/completed appointment add remains rejected (by contract).
7. H-CALTE still off; no P1 work.

---

## Summary scorecard

| Feature | Classification |
|---------|----------------|
| Add services to existing appt (CRM API) | Implemented and MySQL-tested |
| Add-services conversation + explicit confirm | Implemented and fixture-tested |
| Multi-stylist draft + CRM persist | Implemented and MySQL-tested |
| Per-line availability | Implemented and MySQL-tested |
| Redis + DB idempotency via Express | Implemented and MySQL-tested |
| Auth / tenant / cross-tenant E2E | Implemented and MySQL-tested |
| Conversation regression phrases | Implemented and fixture-tested |
| Live WA / Gemini / production | Unverified (intentionally disabled) |
