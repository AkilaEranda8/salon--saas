# RC9a Phase 2.1 — CRM add-services contract (design only)

**Status:** Implemented in RC9a Phase 2.2 (`POST /crm-integration/appointments/:id/services`).  
**Constraint:** Do not silently mutate an existing confirmed appointment. No incompatible change to `POST /crm-integration/appointments`.  
See also: `docs/RC9A_PHASE22_EXISTING_APPOINTMENT_MULTISTYLIST.md`.

---

## Problem

WhatsApp AI may need to add a service to an **already confirmed** appointment (same visit).  
Today:

| Path | Behaviour |
|------|-----------|
| `POST /crm-integration/appointments` | Creates a **new** appointment (+ lines). Idempotency is create-only. |
| Salon UI `PUT` appointment | Can merge `service_staff` / lines transactionally (full edit). |
| CRM `PUT /appointments/:id` | Reschedule date/time/staff only — **no** service-line merge. |

Silently rewriting `POST` create into an “upsert services” would break idempotency and AI booking refs.

---

## Proposed endpoint (additive)

```
POST /api/crm-integration/appointments/:id/services
Auth: X-Service-Key + X-Tenant-Id
```

### Request body

```json
{
  "add_service_ids": [12, 15],
  "service_staff": [
    { "service_id": 12, "staff_id": 3 },
    { "service_id": 15, "staff_id": 8 }
  ],
  "idempotency_key": "wa-addsvc:{tenant}:{appt}:{ids}",
  "notes": "optional customer note"
}
```

### Server rules (must all pass before write)

1. **Tenant scope:** `Appointment.findOne({ id, tenant_id })` — 404 if missing.
2. **Status gate:** only `confirmed` or `pending` (reject `completed` / `cancelled` / `in_service` unless product later allows).
3. **Reference preserved:** appointment `id` unchanged; do not create a second header row.
4. **Validate catalogue:** each added id active for tenant; reject unknown ids with 404.
5. **Prevent duplicates:** if `appointment_services` already has `service_id`, return **409** `duplicate_service` (do not no-op silently unless idempotency replay).
6. **Recalculate:** sequential times from original start; `amount` = sum of all line prices; total duration = sum of line durations.
7. **Availability recheck:** `listAvailableSlots` for **primary staff** (or per-line staff windows) using **full new duration**; if current start no longer fits → **409** with `available_slots` — **never auto-move** the appointment.
8. **Transaction:** update `appointments.amount` (+ notes marker) + insert new `appointment_services` rows in one Sequelize transaction; rollback on any failure.
9. **Idempotency:** notes marker `[addsvc-idem:…]` or Redis key; replay returns same appointment + links without inserting again.
10. **Outbound:** do **not** send a second customer WhatsApp template by default; AI turn owns confirmation text (`customer_notify: deferred_to_ai_turn`).

### Success response `200`

```json
{
  "appointment": { "id": 42, "amount": 9500, "…": "…" },
  "service_links": [ /* full ordered lines after merge */ ],
  "added_service_ids": [12, 15],
  "total_duration_minutes": 150,
  "idempotent": false,
  "customer_notify": "deferred_to_ai_turn"
}
```

### Error codes

| HTTP | When |
|------|------|
| 400 | Empty `add_service_ids`, bad status, outside hours |
| 404 | Appointment or service not found for tenant |
| 409 | Duplicate service, slot conflict (`available_slots`), in-progress idem lock |

---

## AI engine usage (future)

- Only call after customer **explicitly** confirms adding the service.
- Pass `idempotency_key` derived from appointment id + sorted new service ids.
- On 409 with `available_slots`, re-enter time selection — never invent a new start.

---

## Explicit non-goals for Phase 2.1

- No implementation of this route in this phase (contract only).
- No silent mutation of existing appointments via create.
- No H-CALTE / production activation.
