# HEXALYTE LARVENDO — RC9a Extended Conversation Reliability Audit

**Scope:** Local RC9a candidate only  
**Date:** 2026-11-17  
**Constraints honored:** No production access, no WhatsApp outbound, no live Gemini, no deploy/restart/commit/push, `H_CALTE_ENABLED=false`, no H-CALTE P1 work.

---

## Summary

Confirmed defects were fixed in the local tree with deterministic regression coverage. Suspected issues that need more evidence (or backend multi-service create support) are listed separately and **not** claimed fixed.

**Automated results**
- `ai_engine/tests/test_rc9a_extended_conversation_reliability.py` — **13 passed**
- `backend/services/__tests__/crmInboundDedupeRc9a.test.js` — **2 passed**
- Related replay/idempotency/ude/price completeness suites re-run for smoke (see test log)

---

## Issue matrix

### 1. Intent — duration answered with price / “I asked for time, not price”

| Field | Detail |
|--------|--------|
| Screenshot scenario | Customer asks duration; AI quotes price; customer corrects “time, not price” |
| Status | **Confirmed defect — fixed** |
| Root cause | `_HOURS_RE` matched bare Sinhala `වේලා` before duration; no duration hard-gate; pricing hard-gate could still fire; quality didn’t treat price-only replies as duration misses |
| Existing code path | `classify_intent` → `_maybe_pricing_resolver_reply` → Gemini |
| Files modified | `ai_engine/app/conversation_intelligence.py`, `ai_engine/app/pricing_resolver.py`, `ai_engine/app/main.py`, `ai_engine/app/response_quality.py`, `ai_engine/app/booking_flow.py` (`_CORRECTION_RE`) |
| Exact fix | Duration cues ranked before hours; `වේලා` removed from hours regex; `is_duration_enquiry` + duration hard-gate; price rejection / correction patterns for “time, not price”; mismatch + quality fail on price-only duration answers |
| Regression test | `test_duration_ask_not_classified_as_hours_or_price`, `test_correction_time_not_price`, `test_duration_reply_mismatch_when_price_only` |
| Result | **PASS** |

### 2. Duplicate inbound — webhook redelivery vs intentional repeat

| Field | Detail |
|--------|--------|
| Screenshot scenario | Customer repeats “I need haircut booking for tomorrow 8.30am” |
| Status | **Confirmed defect (body debounce) — fixed**; WA-id dedupe already solid |
| Root cause | Body debounce skipped **any** same text within 12s even when `waMessageId` differed, discarding intentional repeats |
| Existing code path | `enqueueInboundTurn` → Redis NX debounce + Bull `wa-in-{tenant}-{waMessageId}` |
| Files modified | `backend/services/crmInboundTurnService.js` |
| Exact fix | Body debounce only when `waMessageId` is missing; Cloud API redelivery continues to rely on unique jobId + DB `wa_message_id` |
| Regression test | `crmInboundDedupeRc9a.test.js` + `test_repeated_booking_request_continues_same_flow` |
| Result | **PASS** |

### 3. Date/time and availability (Sinhala / Singlish)

| Field | Detail |
|--------|--------|
| Screenshot scenario | heta / ude / 8.30 / 11 am walata |
| Status | **Mostly already present — covered by regression**; live slot substitution not newly changed |
| Root cause | Prior parsers exist; this audit adds deterministic parse assertions |
| Existing code path | `booking_flow._parse_date` / `_parse_time` + slot recheck before book |
| Files modified | Tests only (parsers unchanged this pass) |
| Exact fix | N/A (no parser bug reproduced locally without live catalogue/slots) |
| Regression test | `test_datetime_parsing_variants`, `test_short_followup_ude_time` |
| Result | **PASS** (parser); availability alternatives remain dependent on `check_availability` tool data |

### 4. Multi-service scheduling

| Field | Detail |
|--------|--------|
| Screenshot scenario | Facial + Wax + Hair Color / Haircut + Full Leg Wax |
| Status | **Partial fix — confirmed limitation documented** |
| Root cause | Extras only via `_EKATHU_RE`; `book_appointment` persists **one** `service_id`; extras in notes |
| Existing code path | `_try_add_extra_service` → `_draft_total_duration` → confirm notes |
| Files modified | `ai_engine/app/booking_flow.py` |
| Exact fix | Wider `_EKATHU_RE`; extras included in idempotency key; notes disclose primary-row limitation; duration still sums extras for slot checks |
| Regression test | `test_multi_service_duration_and_idempotency_includes_extras`, `test_ekathu_regex_accepts_also_add` |
| Result | **PASS** for duration/idempotency honesty; **not** claiming true multi-row `appointment_services` create |

### 5. Long-duration services (~300 min Botox)

| Field | Detail |
|--------|--------|
| Screenshot scenario | Botox Hair Treatment ~300 minutes |
| Status | **Mostly already guarded — regression added** |
| Root cause | Residual risk was silent `30` defaults elsewhere; draft total duration already sums catalogue minutes |
| Existing code path | `_draft_total_duration` + `validate_booking_preflight` + slot recheck |
| Files modified | Tests (+ multi-service duration path) |
| Exact fix | Assert 300-min draft total; no invented slots in tests |
| Regression test | `test_long_duration_botox_uses_catalogue_minutes` |
| Result | **PASS** |

### 6. Duplicate outbound confirmations

| Field | Detail |
|--------|--------|
| Screenshot scenario | Multiple confirmation messages for one appointment |
| Status | **Confirmed defect (dual channel) — fixed** |
| Root cause | AI `booked` replyText **and** `sendBookingConfirmation` template/text both fired on the same turn |
| Existing code path | `processInboundAiTurn` booking block → `sendBookingConfirmation` |
| Files modified | `backend/services/crmInboundTurnService.js` |
| Exact fix | If AI reply already contains confirmation language, skip template send and record `CrmFollowUpJob` with `suppressed_duplicate_template` so retries stay idempotent |
| Regression test | `crmInboundDedupeRc9a.test.js` (regex marker) |
| Result | **PASS** (policy unit); end-to-end WA send not exercised (outbound forbidden in this task) |

### 7. Existing booking change / “Cancel this”

| Field | Detail |
|--------|--------|
| Screenshot scenario | Booking #154 update then “Cancel this” |
| Status | **Confirmed gap — partially fixed** |
| Root cause | CI cancel required “appointment\|booking” nearby; “Cancel this” missed; SM cancel regex lacked bare “cancel this” |
| Existing code path | `classify_intent` + `booking_flow.detect_intent` / cancel SM |
| Files modified | `conversation_intelligence.py`, `booking_flow.py` |
| Exact fix | “Cancel this” / active-booking memory / mid-flow cancel detection aligned |
| Regression test | `test_cancel_this_intent`, `test_reschedule_then_cancel_this` |
| Result | **PASS** for intent routing; full #154 E2E cancel with live DB not run locally |

### 8. Handoff on clear booking

| Field | Detail |
|--------|--------|
| Screenshot scenario | Clear book request → generic human handoff |
| Status | **Confirmed defect — fixed** |
| Root cause | Early `handle_booking_turn` return called `_detect_handoff` without the Gemini-path suppress for booking confirmation |
| Existing code path | `main.py` early / soft booking returns |
| Files modified | `ai_engine/app/main.py` |
| Exact fix | Suppress booking-confirmation handoff when booking status is confirmed (or handoff reason is confirm-class) |
| Regression test | Covered indirectly via booking flow + intent book tests; suppress action appended in path |
| Result | **PASS** (code path + related book intent tests) |

---

## Suspected (not claimed fixed)

| Item | Why suspected |
|------|----------------|
| True multi-service `appointment_services` rows | Backend `book_appointment` still single `service_id` |
| Silent slot substitution under partial catalogue | Needs fixture with conflicting live slots |
| Baileys same-body different-id without WA id | Body debounce still applies when `waMessageId` absent (intentional) |
| Gemini free-form duration answers when hard-gate misses topic | Hard-gate needs catalogue match / memory duration |

---

## Files touched (local RC9a)

- `ai_engine/app/conversation_intelligence.py`
- `ai_engine/app/pricing_resolver.py`
- `ai_engine/app/response_quality.py`
- `ai_engine/app/booking_flow.py`
- `ai_engine/app/main.py`
- `backend/services/crmInboundTurnService.js`
- `ai_engine/tests/test_rc9a_extended_conversation_reliability.py` *(new)*
- `backend/services/__tests__/crmInboundDedupeRc9a.test.js` *(new)*
- `docs/RC9A_EXTENDED_CONVERSATION_RELIABILITY_AUDIT.md` *(this report)*

---

## How to re-run tests

```powershell
cd e:\salon_v1\ai_engine
$env:AI_ENGINE_SERVICE_SECRET='rc9a-local-test-secret'
python -m pytest tests/test_rc9a_extended_conversation_reliability.py -q

cd e:\salon_v1\backend
node --test services/__tests__/crmInboundDedupeRc9a.test.js
```
