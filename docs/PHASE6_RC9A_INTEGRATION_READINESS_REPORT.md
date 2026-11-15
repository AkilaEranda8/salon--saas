# Phase 6 RC9a — Final integration readiness

**Candidate:** `_release/phase6_t28_rc9a`  
**Parent:** `phase6_t28_rc9` (immutable, not overwritten)  
**Also preserves:** `phase6_t28_rc8`  
**Status:** `NOT_DEPLOYED` — local only  
**Date:** 2026-11-15

## Purpose

Integrate RC9 answer/memory work with the three audit hotfixes, prove Redis-loss multi-turn recovery behaviour, and ship a **new** immutable package without mutating RC8/RC9.

## Hotfix review (live tree → RC9a)

| Defect | Fix location | Status |
|--------|--------------|--------|
| Stale `last_service_id` / pricing key after correction | `response_quality.merge_memory_correction`, `crmAiMemoryMerge.resolveLastServiceId` / upsert | Intact |
| Duplicate Q&A (echo + append) | CI patch no longer echoes `qa_history`; `appendQaHistory` dedupes, cap 12 | Intact |
| Cross-tenant patch claim | `assertPatchTenant` in upsert | Intact |

## RC9 core fixes still present

- `memoryToContext` returns full structured state (`qa_history`, truth, dates, service id)
- Referents: `eka` / `ekata` / `kalin kiwwa` / duration follow-ups
- Quality: off-topic pitch + generic book CTA rejected; `verified_amounts` wired
- Booking flow stamps `conversation_truth` onto `booking_flow_state`
- Backend remains authoritative for prices/bookings — no invented confirm

## Redis-loss multi-turn booking recovery

New test: `ai_engine/tests/test_rc9a_redis_loss_booking_recovery.py`

1. CRM records service select (keratin + id 42)  
2. CRM records date `2026-11-20`  
3. Redis session → empty IDLE (no draft / no truth)  
4. Customer sends `10am`  
5. **Assert:** prompt/context recovers keratin + date from CRM  
6. **Assert:** no invented `booking_status=confirmed`; fake “locked in / confirmed” fails quality gate  
7. **Assert:** correction after Redis loss still clears stale service IDs  

## Verification matrix

| Check | Result |
|-------|--------|
| Service corrections clear IDs / pricing keys | Pass |
| Q&A deduped + capped at 12 | Pass |
| Cross-tenant patch / row isolation | Pass |
| Quality gates not weakened | Pass |
| RC8 / RC9 snapshot folders untouched | Pass |

## Regression results (local)

```
Python: 56 passed
  test_rc9_conversation_memory_replay
  test_rc9_audit_memory_safety
  test_rc9a_redis_loss_booking_recovery
  test_human_understanding_engine
  test_response_quality_validator
  test_rc7_conversation_truth_booking
  test_rc8_cost_router_budget

Node:   10 passed
  crmAiMemoryRc9.test.js
  crmAiMemoryRc9Audit.test.js
```

## Snapshot comparison

- **RC8 / RC9:** package script verifies `MANIFEST.json` SHA unchanged after packaging.
- **RC9a vs RC9:** expected hash changes on audit-touched files (`conversation_intelligence`, `response_quality`, `crmAiMemoryService`) plus **new** `crmAiMemoryMerge.js` and RC9a tests.
- **RC9a vs RC8:** overlapping paths differ (cost-control vs memory) as expected; RC8 package not modified.

## Safety

- No overwrite of `_release/phase6_t28_rc8` or `_release/phase6_t28_rc9`
- No commit, push, deploy, production restart, or WhatsApp
- Await **separate approval** before staging evaluation or deployment

**STOP**
