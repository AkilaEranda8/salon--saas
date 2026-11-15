# Phase 6 RC9 — Final audit report

**Date:** 2026-11-15  
**Scope:** CRM memory after Redis loss · corrections vs stale IDs · Q&A duplication · tenant isolation  
**Mode:** Read + focused regression; fix **only** reproducible defects  
**Production:** unchanged · no commit / push / deploy / restart / WhatsApp  
**Snapshots:** `_release/phase6_t28_rc8` and `_release/phase6_t28_rc9` **preserved** (not rewritten)

---

## Files & functions inspected

| Area | Path | Functions |
|------|------|-----------|
| CRM load/upsert | `backend/services/crmAiMemoryService.js` | `loadMemory`, `memoryToContext`, `upsertMemoryFromTurn` |
| CRM merge helpers (new) | `backend/services/crmAiMemoryMerge.js` | `appendQaHistory`, `resolveLastServiceId`, `applyServiceCorrectionPatch`, `assertPatchTenant` |
| Inbound wire | `backend/services/crmInboundTurnService.js` | `loadMemory(tenantId, …)` → `memoryToContext` → turn |
| Model index | `backend/models/CrmAiMemory.js` | `tenant_id` + `(tenant_id, phone)` index |
| CI context | `ai_engine/app/conversation_intelligence.py` | `build_conversation_context`, `memory_patch_from_context`, `format_context_for_prompt` |
| Corrections | `ai_engine/app/response_quality.py` | `merge_memory_correction` |
| Truth | `ai_engine/app/conversation_truth.py` | `ConversationTruth`, `set_field`, `format_truth_for_prompt` |
| Booking Redis | `ai_engine/app/booking_flow.py`, `session_store.py` | `session_key`, `get_session`/`save_session`, `_attach_flow_state`, `load_session_raw` |
| Turn wire | `ai_engine/app/main.py` | truth-from-CRM prompt; `memory_correction` action; `qa_append` patch |

---

## 1. CRM memory recovery after Redis loss/restart

### Code path
1. Booking SM: Redis key `ai:booking:session:{tenant_id}:{conversation_id}:{phone}` (`session_store.redis_key` / `booking_flow.session_key`).
2. After Redis wipe, `load_session_raw` → empty → new `Session()` (IDLE, empty draft).
3. CRM MySQL `CrmAiMemory` is independent: `loadMemory(tenantId, …)` → `memoryToContext` returns topic, price, date/time, `qa_history`, `conversation_truth`, `last_service_id`.
4. `main.py` injects CRM `conversation_truth` into the system prompt even when Redis session is gone.

### Verdict
| Layer | After Redis loss |
|-------|------------------|
| Conversational CRM memory (topic, price, Q&A, truth prompt) | **Recovers** via MySQL |
| Live booking SM draft (step, slots, Redis truth object) | **Not rehydrated** into Redis (empty IDLE session) |

**Not treated as a silent data bug:** Redis SM is intentionally authoritative for in-flight booking steps (C12). CRM still prevents “total amnesia” in Gemini context. Full draft restore from CRM was **not** added (would risk wrong auto-advance after outage).

### Tests
- `audit1_crm_memory_survives_redis_loss_via_memoryToContext` (Node)
- `test_audit_crm_truth_recovers_into_prompt_after_redis_loss` (Python)

---

## 2. Customer corrections vs stale service IDs / state

### Code path (pre-fix defect — reproducible)
1. `main.py` → `merge_memory_correction(..., field="last_service", new_value=haircut)`.
2. Old helper updated `last_service` / `current_topic` but **left `last_service_id` and truth IDs intact**.
3. Upsert used `flowAct?.service_id \|\| patch.last_service_id \|\| prevMeta.last_service_id` — **`\|\|` cannot clear** a stale numeric ID.

**Failure case:** keratin `last_service_id=42` → customer “nemei haircut” → meta still `42` while name says haircut.

### Fix (live tree only; RC9 snapshot untouched)
- `merge_memory_correction`: null `last_service_id` / `pricing_service_key`; rewrite truth service name/id on correction.
- `resolveLastServiceId` + upsert: honor explicit null after correction.
- `applyServiceCorrectionPatch` (JS helper) mirrors the rule for Node tests.

### Tests
- `audit2_correction_clears_stale_service_id`
- `audit2_resolveLastServiceId_honors_explicit_null_after_correction`
- `test_audit_correction_clears_stale_service_id`

---

## 3. Duplicate Q&A history from per-turn patches

### Code path (pre-fix defect — reproducible)
1. `memory_patch_from_context` included **full** `ctx.qa_history` (already from CRM).
2. `main.py` also appended a `qa_append` CI action with the new pair.
3. `upsertMemoryFromTurn` did `prevMeta.qa_history + patch.qa_history` with **no dedupe** → every turn re-appended the entire prior chain (until `-12` cap).

**Failure case:** prior `[Q1,Q2]` + echoed `[Q1,Q2,Q3]` → stored `[Q1,Q2,Q1,Q2,Q3]` (duplicates).

### Fix
- CI `memory_patch_from_context` **no longer echoes** `qa_history` (new pairs only via `qa_append`).
- `appendQaHistory(prior, incoming)` dedupes by normalized `q||a`, cap 12.

### Tests
- `audit3_qa_history_no_duplicate_when_prior_echoed`
- `audit3_qa_history_caps_at_12`
- `test_audit_memory_patch_does_not_echo_full_qa_history`

---

## 4. Tenant isolation

### Code path
- `loadMemory` / `upsertMemoryFromTurn`: always `where: { tenant_id: tenantId }`.
- Model index: `(tenant_id, phone)`.
- Redis booking key prefixed with `tenant_id`.
- Same phone on tenants 28 vs 99 → different Redis keys and CRM rows.

### Gap found & fixed
- Memory patches could carry a `tenant_id` hint; upsert did not reject a **mismatched** claim (row still written under caller tenant, but patch content from a confused cross-tenant blob would still merge).
- **Fix:** `assertPatchTenant(tenantId, patch)` — drop patch fields if claimed tenant ≠ caller.

ConversationTruth blobs have no embedded tenant id; isolation is **row-scoped** (acceptable given load filters).

### Tests
- `audit4_assertPatchTenant_rejects_cross_tenant_claim`
- `test_audit_session_key_is_tenant_scoped`

---

## Quality gates

`test_audit_quality_gates_not_weakened` — informational `Eka keeyada?` still fails on generic book CTA. No gates loosened.

---

## Test results (local)

```
Node:  9 passed  (crmAiMemoryRc9 + crmAiMemoryRc9Audit)
Python: 34 passed (audit + replay + response_quality + human_understanding)
RC8_SNAPSHOT_OK
RC9_SNAPSHOT_OK
```

---

## Summary

| Item | Finding | Action |
|------|---------|--------|
| 1 Redis → CRM recovery | Conversational CRM recovers; booking Redis SM stays empty | Documented; no unsafe full draft restore |
| 2 Corrections / stale IDs | **Defect** — ID survived name correction | **Fixed** in live tree |
| 3 Duplicate Q&A | **Defect** — CI echo + append | **Fixed** in live tree |
| 4 Tenant isolation | Load/key OK; patch claim unchecked | **Hardened** with `assertPatchTenant` |

Live-tree audit hotfixes are **not** baked into the frozen `_release/phase6_t28_rc9` folder. Promote via a separate approved package when ready.

**STOP** — awaiting review. No commit, push, deploy, restart, or WhatsApp.
