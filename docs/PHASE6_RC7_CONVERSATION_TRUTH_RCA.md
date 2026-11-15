# Phase 6 RC7 — Conversation Memory & Booking Consistency RCA

**Tenant:** 28 – Larvendo  
**Anchor date:** 2026-11-15 Asia/Colombo  
**Candidate:** `phase6_t28_rc7` (local)  
**Production:** untouched (RC4/RC6 preserved)

## Bug 1 — Relative date → Nov 16

**Cause:** `_parse_date` used `date.today()` (server TZ) and had no `labana mase` / `1laweni sathiye` grammar. Ambiguous phrases fell through to Gemini, which invented `2026-11-16`.

**Fix:** `parse_relative_date` + Colombo clock; first Saturday of next month → **2026-12-05**; weekday validated.

## Bug 2 — Dressing → Ladies Hair Cut

**Cause:** Stale `hint_service` / CRM memory applied on generic booking; confirmed service overwritable.

**Fix:** Suppress service hint on date-only booking asks; `ConversationTruth` blocks low-confidence overwrites; explicit change required to replace.

## Bug 3 — 120 min dressing → 30 min slots

**Cause:** Availability often queried with default `duration=30` when draft duration unset / not guarded.

**Fix:** Catalogue duration written on pick; `availability_duration_guard` forces draft/catalogue minutes into `check_availability`; preflight mismatch flag.

## Bug 4 — “kalin kiwwe dressing” forgotten

**Cause:** No structured recall path; Gemini regenerated catalogue.

**Fix:** `is_memory_recall_ask` + `conversation_truth_recall` returns selected/proposed IDs+names without regenerating.

## Bug 5 — “11 kiy nne me masene” → Additional service

**Cause:** `_pick_by_index_or_name` treated **any** `\d{1,2}` in text as 1-based catalogue index → item 11.

**Fix:** Index only on **pure** `^\d{1,2}$`; `short_numeric_intent` routes month/day phrases to `date_day`.

## Bug 6 — “next months booking” assumed Hair Cut

**Cause:** Bare booking + date used haircut hint when no category present.

**Fix:** `service_hint_suppressed` when message is dateish without service category; ask which service.

---

## Conversation Truth architecture

Fields (each: value, source_message, confidence, confirmed, updated_turn):

current_intent · selected_service_id/name · proposed_services · service_corrections · preferred_date/time · selected_branch · service_duration · availability_result · pending_clarification · booking_confirmation

Persisted on booking `Session.truth` (Redis). Gemini receives `format_truth_for_prompt` — must not freely overwrite confirmed booking context.
