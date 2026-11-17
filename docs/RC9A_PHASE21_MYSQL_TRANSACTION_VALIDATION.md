# HEXALYTE LARVENDO — RC9a PHASE 2.1  
# Real Database & Booking Transaction Validation

**Date:** 2026-11-17  
**Scope:** Local RC9a candidate only  
**Prior:** `docs/RC9A_PHASE2_BOOKING_INTEGRATION_AUDIT.md`  
**DB target:** disposable MySQL `rc9a_phase21_test` on `127.0.0.1:3307` via `docker-compose.rc9a-staging.yml`  
**Constraints honored:** No production / no `46.62.135.100` / no live WhatsApp / no live Gemini / no deploy / no restart / no commit / no push / `H_CALTE_ENABLED=false` / no H-CALTE P1 / immutable snapshots untouched.

**This report does not claim production readiness.**

---

## Classification legend

| Label | Meaning |
|-------|---------|
| **Implemented and MySQL-tested** | Code path exercised against real isolated MySQL with persisted row proof |
| **Implemented and fixture-tested** | Code/path covered by in-memory or mock harness only |
| **Partially tested** | Behaviour present; coverage incomplete |
| **Not implemented** | Contract/design only or absent |
| **Unverified** | Exists in product but not validated this phase |

---

## 1. MySQL integration results

Harness: `backend/services/__tests__/crmAppointmentMysqlRc9aPhase21.test.js`  
Command: `RC9A_PHASE21_MYSQL=1 node --test-concurrency=1 --test services/__tests__/crmAppointmentMysqlRc9aPhase21.test.js`  
Result: **14/14 pass** against Sequelize models on isolated MySQL 8.0 (`rc9a_staging_mysql`).

| Scenario | Result | Classification |
|----------|--------|----------------|
| One service | PASS — 1 appointment + 1 `appointment_services` | Implemented and MySQL-tested |
| Two services | PASS — sequential `10:00` / `10:45`, amount 5500 | Implemented and MySQL-tested |
| Three services | PASS — 3 links, amount 9500 | Implemented and MySQL-tested |
| 300-minute service | PASS — amount 22000, duration 300 | Implemented and MySQL-tested |
| Invalid second service | PASS — NOT_FOUND, counts unchanged | Implemented and MySQL-tested |
| Duplicate service IDs | PASS — collapsed to unique ordered pair | Implemented and MySQL-tested |
| Duplicate idempotency | PASS — same appointment id, no extra rows | Implemented and MySQL-tested |
| Staff unavailable (off day) | PASS — BAD_REQUEST | Implemented and MySQL-tested |
| Outside working hours | PASS — BAD_REQUEST past closing | Implemented and MySQL-tested |
| Overlapping appointments | PASS — SLOT_CONFLICT | Implemented and MySQL-tested |
| Forced link failure rollback | PASS — no partial appointment / no orphans; retry then idempotent | Implemented and MySQL-tested |
| Per-line staff_ids | PASS — line0 staff=1, line1 staff=2 | Implemented and MySQL-tested |

Create path used: `createCrmAppointmentTransactional` (same logic wired into `POST /crm-integration/appointments`).  
**Proof is MySQL rows, not the in-memory booking store.**

---

## 2. Actual persisted database rows (diagnostic dump)

Tenant `921`, after successful run (excerpt):

### `appointments`

| id | service_id | staff_id | date | time | amount | status |
|----|------------|----------|------|------|--------|--------|
| 1 | 1 | 1 | 2027-06-14 | 09:00 | 2000.00 | confirmed |
| 2 | 1 | 1 | 2027-06-14 | 10:00 | 5500.00 | confirmed |
| 3 | 1 | 1 | 2027-06-14 | 12:00 | 9500.00 | confirmed |
| 4 | 4 | 1 | 2027-06-17 | 09:30 | 22000.00 | confirmed |
| 5 | 1 | 2 | 2027-06-14 | 09:00 | 5500.00 | confirmed |
| 6 | 3 | 2 | 2027-06-14 | 11:00 | 4000.00 | confirmed |
| 8 | 1 | 2 | 2027-06-18 | 10:00 | 6000.00 | confirmed |
| 9 | 1 | 1 | 2027-06-16 | 10:00 | 5500.00 | confirmed |

Note: **id 7 is absent** — forced `appointment_services` failure rolled back that attempt (see §3).

### `appointment_services` (selected)

| appointment_id | service_id | staff_id | time | sort_order |
|----------------|------------|----------|------|------------|
| 1 | 1 | 1 | 09:00 | 0 |
| 2 | 1 | 1 | 10:00 | 0 |
| 2 | 2 | 1 | 10:45 | 1 |
| 3 | 1 | 1 | 12:00 | 0 |
| 3 | 2 | 1 | 12:45 | 1 |
| 3 | 3 | 1 | 13:45 | 2 |
| 4 | 4 | 1 | 09:30 | 0 |
| 8 | 1 | 2 | 10:00 | 0 |
| 8 | 3 | 2 | 10:45 | 1 |
| 9 | 1 | 1 | 10:00 | 0 |
| 9 | 2 | 2 | 10:45 | 1 |

---

## 3. Rollback test results

| Check | Result |
|-------|--------|
| Force failure after `Appointment.create`, before link persist | `FORCE_LINK_FAILURE` |
| `appointments` count unchanged after failure | PASS |
| `appointment_services` count unchanged (no orphans) | PASS |
| Retry without force succeeds | PASS (id 8) |
| Second retry with same idempotency key | PASS (`idempotent: true`, same id) |

**Classification:** Implemented and MySQL-tested.

---

## 4. Idempotency test results

| Mechanism | Result |
|-----------|--------|
| Notes marker `[idem:…]` lookup | PASS on MySQL (no Redis required for this harness) |
| Duplicate request returns same appointment | PASS |
| No duplicate header/link rows | PASS |
| Redis SET NX lock path | Unverified this run (`REDIS_URL` empty in harness) |

**Classification:** Implemented and MySQL-tested (DB marker). Redis lock: Partially tested / Unverified in Phase 2.1 harness.

---

## 5. Existing appointment update capability

| Item | Status |
|------|--------|
| Safe CRM add-services API | **Not implemented** (contract only) |
| Contract document | `docs/RC9A_PHASE21_ADD_SERVICES_API_CONTRACT.md` |
| Proposed route | `POST /crm-integration/appointments/:id/services` |
| Silent mutate via create | Explicitly forbidden |
| Salon UI already merges lines | Unverified E2E this phase (code present in `appointmentController`) |

**Classification:** Not implemented (CRM); contract prepared.

---

## 6. Staff allocation findings

| Surface | Behaviour |
|---------|-----------|
| Salon UI | Per-line `staff_id` via `service_staff` / items; preserves specialists on edit |
| CRM AI create (before 2.1) | Stamped **one** `staff_id` onto every `appointment_services` row |
| CRM AI create (after 2.1) | Accepts optional `service_staff` / per-service `staff_id`; otherwise falls back to header staff. **Does not invent** specialists |
| MySQL proof | Appointment 9: haircut→staff 1, wax→staff 2 |

AI booking flow still sends a **single** `staff_id` today; multi-specialist selection in WhatsApp remains **Partially tested / Unverified** end-to-end.

**Classification:** Implemented and MySQL-tested (CRM persist when explicit); AI multi-stylist UX Unverified.

---

## 7. Mocked outbound results

Harness: `backend/services/__tests__/crmOutboundMockRc9aPhase21.test.js` — **5/5 pass**. No live WhatsApp.

| Case | Result | Classification |
|------|--------|----------------|
| AI confirmation + booking ref | PASS | Implemented and fixture-tested |
| CRM notification suppression | PASS (`crm_notification_suppressed`) | Implemented and fixture-tested |
| Retry after failed send | PASS | Implemented and fixture-tested |
| Duplicate FollowUpJob dedupe | PASS | Implemented and fixture-tested |
| Failed outbound marks job failed | PASS | Implemented and fixture-tested |

CRM create response continues to use `customer_notify: deferred_to_ai_turn` (no `notifyAppointmentConfirmed` on create).

---

## 8. Availability alternative results

| Area | Result | Classification |
|------|--------|----------------|
| CRM 409 body with `available_slots` | Already emitted by create path | Implemented and MySQL-tested (conflict path) |
| AI booking_flow create 409 handler | Updated: clear draft time, `AWAIT_TIME`, list alts, `auto_substituted: false` | Implemented and fixture-tested |
| Never auto-substitute | Enforced in flow + pytest | Implemented and fixture-tested |
| Pytest | `tests/test_rc9a_phase21_availability_alternatives.py` — 4/4 | Implemented and fixture-tested |
| Full WhatsApp E2E 409 conversation | Not run (no live WA) | Unverified |

---

## 9. Modified files

| File | Change |
|------|--------|
| `backend/config/database.js` | `DB_PORT` support for staging `:3307` |
| `backend/services/crmAppointmentCreateService.js` | **New** — transactional create + rollback hook |
| `backend/services/crmMultiServiceBooking.js` | `resolveLineStaffIds`; per-line staff in sequential lines |
| `backend/controllers/crmIntegrationController.js` | Delegates create to shared service |
| `backend/services/__tests__/crmAppointmentMysqlRc9aPhase21.test.js` | **New** MySQL harness |
| `backend/services/__tests__/crmOutboundMockRc9aPhase21.test.js` | **New** outbound mock harness |
| `backend/services/__tests__/crmMultiServiceBookingRc9aPhase2.test.js` | Line-staff unit test |
| `ai_engine/app/booking_flow.py` | Create-path 409 → alternatives, no auto-sub |
| `ai_engine/tests/test_rc9a_phase21_availability_alternatives.py` | **New** |
| `docs/RC9A_PHASE21_ADD_SERVICES_API_CONTRACT.md` | **New** contract |
| `docs/RC9A_PHASE21_MYSQL_TRANSACTION_VALIDATION.md` | **New** this report |

Infrastructure used (not modified for production): `docker-compose.rc9a-staging.yml`, `docs/staging/rc9a-staging.env`.

---

## 10. Remaining limitations

1. **Not production-ready** — local disposable DB only; no production soak / multi-tenant load.
2. **HTTP controller E2E** against Express + service key not run this phase (service layer + same transaction code proven).
3. **Redis idempotency lock** not exercised (`REDIS_URL` empty in MySQL harness).
4. **Add-services to existing appointment** — contract only; not implemented.
5. **AI multi-stylist picker** — CRM can persist per-line staff; WhatsApp draft still one `staff_id`.
6. **Per-line availability** — slot probe still uses header/primary staff window for the full visit; multi-staff conflict matrix not fully revalidated.
7. **No live Gemini / WhatsApp / H-CALTE** — by design.
8. **Staff notify** on create still may enqueue in non-test runtime; customer confirm remains deferred to AI turn.
9. Disposable volume `rc9a_staging_mysql_data` retains staging data locally — wipe with compose down `-v` when finished.

---

## Summary scorecard

| Feature | Classification |
|---------|----------------|
| Multi-service CRM create → MySQL | Implemented and MySQL-tested |
| Transaction + rollback | Implemented and MySQL-tested |
| Idempotent retry (DB marker) | Implemented and MySQL-tested |
| Overlap / off-day / hours / invalid service | Implemented and MySQL-tested |
| Per-line staff when explicit | Implemented and MySQL-tested |
| Mock outbound / FollowUpJob | Implemented and fixture-tested |
| 409 alternatives in AI flow | Implemented and fixture-tested |
| Add services to existing appt (CRM) | Not implemented |
| Live WA / Gemini / production | Unverified (intentionally disabled) |
