# Phase 6 RC7 — Security Evidence & Rollback Plan

## Security

| Control | Evidence |
|---------|----------|
| Tenant isolation | Memory keyed `tenant_id` + phone digits; patch carries `tenant_id` |
| No secret logging | `turn_trace` strips api_key/password/token; memory scrub |
| Phone privacy | Redacted `***NNNN` in traces |
| No health diagnosis | Quality missing `health_diagnosis_forbidden` |
| No fake media | `media_claim_without_media` gate |
| Mutation confirm | Planner marks consequential tools; booking_flow confirm unchanged |
| No prod touch | NOT_DEPLOYED; no WA; no DB customer mutations in this work |

## Rollback (if later deployed)

1. Stop at HOLD today — nothing to roll back in prod for RC7.  
2. After a future approved deploy: restore snapshot from `/root/xanesalon/_rollback/phase6_rc7_*` (or prior RC6 snapshot).  
3. `docker cp` prior files for: turn_planner/trace (remove), response_quality, conversation_intelligence, booking_flow, main, pricing_resolver, crmAiMemoryService, crmHandoffInboundPolicy.  
4. Restart `ai_engine`, `ai_crm_worker`, `backend`.  
5. Verify import + prior RC6 smoke markers.

Parent `phase6_t28_rc6` remains immutable under `_release/`.
