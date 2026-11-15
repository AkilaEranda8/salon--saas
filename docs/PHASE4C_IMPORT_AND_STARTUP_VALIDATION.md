# Phase 4C — Import and Startup Validation

**Date:** 2026-11-14  
**Scope:** Local validation of RC `phase4c_t28_rc1` only  
**Production restart:** **Not performed**

## Import chain

| Module | Result |
|---|---|
| `app.pricing_resolver` | OK |
| `app.conversation_intelligence` | OK |
| `app.booking_flow` | OK |
| `app.main` | OK |

Symbols verified: `resolve_price`, `build_conversation_context`, `handle_booking_turn`, `_yield_to_llm`, FastAPI `app`.

## Local health

| Check | Result |
|---|---|
| `TestClient` `GET /health` | **200** `{"status":"ok","service":"ai_engine",...}` |
| Production `/health` after deploy | **Not run** (no restart) |

## Node syntax

| File | `node --check` |
|---|---|
| `crmInboundTurnService.js` (backend + worker copy) | OK |
| `crmAiMemoryService.js` (backend + worker copy) | OK |

## Configuration sanity (local)

| Item | Result |
|---|---|
| `AI_ENGINE_SERVICE_SECRET` required for import auth helpers | Set for test process only |
| Hard import of CREATE modules from `main` | Confirmed — incomplete prod copy would fail startup |

## Incomplete-copy failure mode (documented, not induced on prod)

If prod receives new `main.py` without `pricing_resolver.py` + `conversation_intelligence.py`:

- Expected: **ImportError** at ai_engine boot  
- Mitigation: CREATE modules first; health-gate before declaring success  

## Conclusion

**Local import/startup validation: PASS** for the release candidate.  
**Production startup: NOT VALIDATED** (no deploy/restart).
