# Phase 2 P0 Implementation Report — Larvendo T28

**Date:** 2026-11-14  
**Scope:** Local implementation only (approved P0)  
**Status:** COMPLETE — **STOP for review**  
**Production:** No deploy · no restart · no commit · no push · no prod data changes

---

## 1. Summary

Phase 2 P0 makes the booking state machine **yield to Gemini** for media, corrections, FAQs, and other non-step messages; **preserves** booking progress while paused; **resumes** only on explicit continue or a clear step answer; and **fixes cancel session persistence** so cancel never claims success without a verified backend result.

| # | Requirement | Status |
|---|---|---|
| 1 | Fix cancellation session persistence | ✅ |
| 2 | Media/image while booking pending | ✅ |
| 3 | Correction intent handling | ✅ |
| 4 | Latest question > pending booking | ✅ |
| 5 | Safe booking pause / resume | ✅ |
| 6 | Block generic fallback override | ✅ |

---

## 2. Files changed (local)

| File | Change |
|---|---|
| `ai_engine/app/booking_flow.py` | In-place `do_reset`; always `save_session`; `paused`/`pause_reason`; media/correction/details detectors; yield-unless-clear-step; verified cancel; resume |
| `ai_engine/app/main.py` | `has_media` into SM; CORRECTION + MEDIA system prompts; soft fallback skips forced book on correction/media; correction soft text |
| `backend/services/crmInboundTurnService.js` | `isSubstantialCustomerAsk`; correction-aware `alwaysReplyText`; no generic replace on dup for substantial asks |
| `ai_engine/tests/test_phase2_p0_conversation.py` | **New** — reproduces F1–F6 + cancel persistence/retry |

---

## 3. Before → After (conversation evidence)

Evidence basis: Phase 1 live T28 failures (conv `24`) vs local P0 behaviour tests.

### F1 — Hairstyle photo during `await_date`

| | Before (prod) | After (local P0) |
|---|---|---|
| In | `[Customer sent a photo]` while `await_date` | same |
| Out | “Please send a date…” (`bad_date`) · no vision | `handle_booking_turn` → **`None`** → Gemini/vision |
| State | `await_date` (consumed as bad date) | `await_date` + **`paused=true`** · draft kept |
| Test | — | `test_f1_photo_during_await_date_yields_to_gemini` ✅ |

### F2 — “Ahana deta nemei reply denn oya”

| | Before | After |
|---|---|---|
| Out | Generic “Got it! … say *book*” (`always_reply`) | SM yields; correction prompt; inbound uses correction fallback if empty — **not** book/prices welcome |
| Test | — | `test_f2_correction_during_await_date` ✅ |

### F3 — Keratin ask mid-booking

| | Before | After |
|---|---|---|
| Out | Often re-ask date | Pause → Gemini answers keratin |
| Test | — | `test_f3_keratin_during_await_date_pauses` ✅ |

### F4 — Details before book

| | Before | After |
|---|---|---|
| In | `book kara gann kalin details kiyana` | same |
| Intent | Often `book` (regex) | **`chat`** · SM stays idle |
| Test | — | `test_f4_details_before_book_does_not_start_sm` ✅ |

### F5 — Language consistency

| | Before | After |
|---|---|---|
| Pause | Could force Sinhala always-reply on Singlish | Correction/substantial paths use Singlish-aware correction text; SM `script_mode` preserved across pause |
| Test | — | `test_script_mode_preserved_across_pause` ✅ |

### F6 — Pending booking overrides new question

| | Before | After |
|---|---|---|
| Mid-book FAQ/price | Often still date-prompted | Pause; Gemini; resume via `continue` or clear date |
| Test | — | `test_f6_price_enquiry_pauses_then_date_resumes` · `test_paused_step_answer_implicit_resume` ✅ |

### Cancel false-success (appt #145 class)

| | Before (prod) | After (local) |
|---|---|---|
| Mid-book → cancel confirm | Meta `state: idle` · Redis IDLE · `yes` → Gemini lied | State **`await_cancel_confirm` persisted** |
| Cancel API weak/fail | Still said “cancel kara” | **Fail closed** until `appointment.status == cancelled` |
| Retry | Lost | Confirm state kept for retry |
| Tests | — | `test_cancel_session_persists_after_mid_book_interrupt` · `test_cancel_never_claims_success_without_verified_status` · `test_cancel_api_failure_keeps_confirm_for_retry` ✅ |

---

## 4. Technical design notes

### 4.1 `do_reset` / session save

**Bug:** `do_reset()` rebound outer `sess` to a new object and set `cleared=True`, so body mutated the *old* object while `_attach_flow_state` + Redis saw IDLE and **skipped save**.

**Fix:** Mutate the **same** `Session` in place; **always** `save_session` in `finally`.

### 4.2 Priority rule

Mid-flow (and paused):  
**yield to Gemini unless** message is a **clear step answer** (or cancel/reschedule/abort/explicit resume).

### 4.3 Pause / resume

- `Session.paused` + `pause_reason` persisted in Redis.
- Resume: `continue` / `hari ehenam` / … → re-prompt step; **or** clear date/time/yes → implicit resume.
- Draft (service/date/…) preserved while paused.

### 4.4 Verified cancel

```text
cancel_appointment tool OK
  AND (already_cancelled OR appointment.status == "cancelled")
else → cancel_fail, keep AWAIT_CANCEL_CONFIRM for retry
```

### 4.5 Always-reply guard (inbound)

Substantial / correction / media asks: never replace outbound with generic “say *book*” on empty-fill or dup-ack.

---

## 5. Test results

| Suite | Result |
|---|---|
| `tests/test_phase2_p0_conversation.py` + booking/pricing suites | **115 passed** |
| Behaviour harness `_scripts/_qa_behaviour_local.py` | **17/17 (100%)** |

Commands:

```text
pytest tests/test_phase2_p0_conversation.py tests/test_flows_intent_lang.py \
  tests/test_booking_confirm.py tests/test_booking_idempotency_polish.py \
  tests/test_pricing_*.py -q
→ 115 passed

python _scripts/_qa_behaviour_local.py
→ 17/17 PASS
```

---

## 6. Safety compliance

| Rule | Status |
|---|---|
| Local only | ✅ |
| No production deploy / restart | ✅ |
| No commit / push | ✅ |
| No prod DB / staff changes | ✅ |
| Tenant isolation unchanged (no hardcode cross-tenant) | ✅ |
| Appt #145 not modified in prod | ✅ (test uses isolated fake id 145) |

---

## 7. Not in this phase

- Production hot-copy of `booking_flow.py` / `main.py` / inbound service  
- Full Gemini NLU classifier (still regex + pause + Gemini answer)  
- 200+ conversation corpus (Phase 7)  
- Pricing resolver production deploy (separate approval)  
- Phases 3–7 deliverables

---

## 8. Deployment readiness (P0 only)

**Local:** Ready.  
**Production:** **NOT READY** until separate explicit deploy approval for:

1. `ai_engine/app/booking_flow.py`  
2. `ai_engine/app/main.py`  
3. `backend/services/crmInboundTurnService.js` (backend + `ai_crm_worker` containers)

Recommended post-deploy smoke (when approved): photo mid-book, correction mid-book, facial price mid-book, cancel confirm→yes with DB check, Singlish sticky.

---

## 9. Review ask

Approve next step when ready:

- **Phase 2+ local** (deeper Gemini intent / memory), and/or  
- **Explicit production deploy** of these three files (with snapshot + T28 smoke).

**Stop here — awaiting review.**
