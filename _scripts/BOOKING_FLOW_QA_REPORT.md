# Booking Flow QA Report — Phase 3 polish (local)

**Deploy:** No  
**Date:** 2026-11-14

## Polish implemented (local code)

1. **Slot re-check** immediately before `book_appointment` — blocks create if time no longer free.  
2. **Fail closed** if availability re-check errors — never claim booked.  
3. **Booking reference** in success message: `Ref: #\{id\}` (EN/SI/TA/Singlish).  
4. Idempotency key unchanged format: `wa:{tenant}:{phone}:{service}:{staff}:{date}:{time}`.

## Tests

| Test | Result |
|---|---|
| `test_idempotency_key_stable_and_book_once` | PASS — key stable, one create, ref `#501` |
| `test_double_booking_blocked_when_slot_disappears` | PASS — `book_count=0`, slot_recheck ok=false |
| `test_book_api_failure_never_claims_success` | PASS — status failed, no success claim |
| Existing cancel/reschedule/intent flows | PASS (full suite) |

## Preserved behaviour

- Staff still auto-assigned (not shown).  
- Confirm still requires exact yes.  
- Cancel/reschedule paths untouched in this polish beyond shared templates.  
- No staff reactivation.  

## Not live until deploy

Production WhatsApp still uses previous `booking_flow.py` until ai_engine deploy approval.
