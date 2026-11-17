# HEXALYTE LARVENDO — RC9a PHASE 2  
# Full Conversational & Booking Integration Validation

**Date:** 2026-11-17  
**Scope:** Local RC9a candidate only  
**Prior work:** `docs/RC9A_EXTENDED_CONVERSATION_RELIABILITY_AUDIT.md`  
**Constraints honored:** No production, no live WhatsApp, no live Gemini, no deploy/restart/commit/push, `H_CALTE_ENABLED=false`, no H-CALTE P1, immutable snapshots untouched.

---

## 1. Root causes (Phase 2 focus)

| Area | Root cause |
|------|------------|
| Multi-service AI bookings | Salon UI `appointmentController` already supports `appointment_services` transactionally; **CRM integration** `POST /crm-integration/appointments` only wrote one primary service (+ optional single join row swallowed on error). AI extras lived in notes only. |
| Duplicate customer confirms | AI turn reply + `sendBookingConfirmation` + historically `notifyAppointmentConfirmed` from CRM create could all fire. |
| Slot checks for long/multi visits | CRM create used **primary** service duration only for `listAvailableSlots` / working-hours end check. |
| Intentional inbound repeats | Body debounce (Phase 1 fixed) discarded same text with new WA ids. |

---

## 2. Database architecture findings

### Supported (salon core)

| Object | Role |
|--------|------|
| `appointments` | Header row: primary `service_id`, `staff_id`, `date`, `time`, `amount`, `status`, `tenant_id` |
| `appointment_services` | Line items: `appointment_id`, `service_id`, optional per-line `staff_id` / `date` / `time`, `sort_order`; **UNIQUE (appointment_id, service_id)** |
| UI create path | `replaceAppointmentServiceMappings` inside Sequelize transaction with staff row locks + per-line conflict ranges |

### CRM AI path (before Phase 2)

- Created one `appointments` row.
- Tried one `AppointmentService.create` in try/catch (**errors ignored**).
- No `service_ids` / sequential scheduling.

### CRM AI path (after Phase 2)

- Accepts `service_id` + `service_ids[]` / `extra_service_ids[]` / `services[]`.
- Builds **sequential** lines (each service starts when previous ends).
- Validates **full visit** against staff working window.
- Availability probe uses **total duration**.
- Writes all `appointment_services` via `bulkCreate` in the **same** transaction (failure rolls back appointment).
- Amount = sum of catalogue prices for selected services.
- Idempotency key still short-circuits duplicate creates.

---

## 3. Booking integration status

| Capability | Status |
|------------|--------|
| True multi-service DB writes via CRM integration | **Implemented** |
| AI engine passes `service_ids` / `extra_service_ids` | **Implemented** |
| Transactional rollback on bad lines | **Implemented** (CRM + in-memory fixture) |
| Idempotent retry | **Implemented** (Redis/DB marker + fixture) |
| Per-line stylist specialization matrix | **Unverified** (CRM still assigns one staff to all lines) |
| Live MySQL E2E against staging container | **Not run** this session (no deploy; fixtures are in-memory) |
| Adding services onto an *existing* confirmed appointment via CRM API | **Not implemented** (would need dedicated PATCH merge API) |

---

## 4. Actual persisted test records (fixture)

In-memory store (`createInMemoryBookingStore`) after multi-service create:

```
appointment: {
  id: 1000,
  service_id: 1,          // Haircut primary
  date: 2026-11-18,
  time: 08:30,
  amount: 5500,           // 2000 + 3500
  status: confirmed
}
appointment_services:
  [{ service_id: 1, time: 08:30, duration: 45 },
   { service_id: 2, time: 09:15, duration: 60 }]
```

Idempotent retry with same key → same `id`, still **one** appointment / **two** links.  
Invalid lines → **zero** appointments persisted.

> These are deterministic fixture records, not live MySQL rows. Do **not** treat as production DB proof.

---

## 5. Duplicate confirmation test results

| Check | Result |
|-------|--------|
| AI reply already contains confirm language → skip CRM template path (Phase 1) | **PASS** (unit) |
| CRM create skips `notifyAppointmentConfirmed` (customer); staff notify only | **Implemented**; unit asserts `customer_notify=deferred_to_ai_turn` |
| Live WhatsApp delivery | **Unverified** (outbound forbidden) |

---

## 6. Slot / duration validation results

| Scenario | Result |
|----------|--------|
| 45+60+45 sequential schedule | **PASS** (09:00 → 09:45 → 10:45) |
| 300-min Botox fits 09:00–18:00 from 10:00 | **PASS** (ends 15:00) |
| 300-min Botox from 16:00 past closing | **PASS** (`past_closing`, no substitute) |
| Overlap with blocked range | **PASS** (reject, no write) |
| Requested 08:30 not in available list | **PASS** (policy: surface alternatives, do not auto-pick) |

---

## 7. Conversation regression results

| Suite | Result |
|-------|--------|
| `tests/test_rc9a_extended_conversation_reliability.py` | **22 passed** |
| Phase 2 Singlish/EN context pack (time≠price, cancel this, ehema karamu, ekath add, heta ude 11, …) | **PASS** |
| `service_ids` on confirm payload | **PASS** |
| Backend Phase 2 + dedupe Node tests | **11 passed** |

---

## 8. Files modified

| File | Change |
|------|--------|
| `backend/services/crmMultiServiceBooking.js` | **New** — normalize IDs, sequential lines, window/conflict helpers, in-memory fixture store |
| `backend/controllers/crmIntegrationController.js` | Multi-service transactional create; total duration availability; suppress customer `notifyAppointmentConfirmed` |
| `ai_engine/app/booking_flow.py` | Payload sends `service_ids` + `extra_service_ids` |
| `backend/services/__tests__/crmMultiServiceBookingRc9aPhase2.test.js` | **New** Phase 2 fixture tests |
| `ai_engine/tests/test_rc9a_extended_conversation_reliability.py` | Phase 2 context pack + multi-service payload assertion |
| `docs/RC9A_PHASE2_BOOKING_INTEGRATION_AUDIT.md` | **This report** |

---

## 9. Known limitations

1. **No live MySQL verification** in this pass — fixture-only persistence proof.
2. **CRM still uses one staff_id** for all lines (UI can assign per-line staff).
3. **Cannot append services to an already-confirmed appointment** via CRM tool yet.
4. **Customer notification channels** (SMS/email templates) other than WA AI reply are deferred; staff still notified.
5. **Availability alternatives** are returned on 409 from CRM create; AI booking SM must still present them (partially covered by existing slot_recheck path).

---

## 10. Remaining blockers

| Blocker | Needed for “full” claim |
|---------|-------------------------|
| Staging/local MySQL fixture run of `POST /crm-integration/appointments` with multi `service_ids` | Claim “persisted in real DB” |
| Optional CRM endpoint to merge extras onto appointment `#154` | Existing booking + add service E2E |
| Mocked transport harness for `sendAndLog` / FollowUpJob | Stronger outbound reliability than regex unit tests |
| Per-line staff specialization for multi-service | Parity with UI booking |

---

## Feature classification

| Feature | Class |
|---------|--------|
| Multi-service CRM create + `appointment_services` | **Implemented + fixture-tested** |
| AI `service_ids` payload | **Implemented + tested** |
| Full-visit duration / closing-time guard | **Implemented + tested** |
| Idempotent multi-service create | **Implemented + fixture-tested** |
| Duplicate customer confirm suppression (AI + CRM) | **Implemented + partially tested** |
| Conversation context pack (Singlish/EN) | **Tested** |
| Live WhatsApp delivery | **Unverified** |
| Live Gemini recovery | **Unverified** (out of scope) |
| Real MySQL E2E | **Unverified** |
| Add-to-existing-appointment CRM API | **Not implemented** |

---

## How to re-run

```powershell
cd e:\salon_v1\backend
node --test services/__tests__/crmMultiServiceBookingRc9aPhase2.test.js services/__tests__/crmInboundDedupeRc9a.test.js

cd e:\salon_v1\ai_engine
$env:AI_ENGINE_SERVICE_SECRET='rc9a-local-test-secret'
python -m pytest tests/test_rc9a_extended_conversation_reliability.py -q
```

**Bottom line:** True multi-service booking is now wired through the CRM integration path using the existing `appointment_services` model, with transactional writes and fixture-proven records. It is **not** claimed as live-DB or live-WhatsApp verified.
