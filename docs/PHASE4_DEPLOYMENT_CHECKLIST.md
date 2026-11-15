# Phase 4 — Deployment Checklist (Larvendo T28)

**Status:** PREPARED — **DO NOT EXECUTE** without separate explicit approval  
**Evidence hashes:** `_scripts/_phase4_prod_hashes.json`  
**Captured:** 2026-11-14  

## 1. Exact changed-file list

| Local file | Prod action | Local sha16 | Prod sha16 (now) |
|---|---|---|---|
| `ai_engine/app/pricing_resolver.py` | **CREATE** | `f38c616f83ac9873` | **MISSING** |
| `ai_engine/app/conversation_intelligence.py` | **CREATE** | `b48ac76f091efb47` | **MISSING** |
| `ai_engine/app/main.py` | **REPLACE** | `a73d79a65d9f9544` | `54fb1d8e327ad022` |
| `ai_engine/app/booking_flow.py` | **REPLACE** | `f70577c7fa077e1d` | `1933294042289bf8` |
| `backend/services/crmInboundTurnService.js` | **REPLACE** (backend + **ai_crm_worker**) | `ef40cdd7dd8b031a` | `2cb7fab3b0dee5c4` |
| `backend/services/crmAiMemoryService.js` | **REPLACE** (backend + **ai_crm_worker**) | `f63ea110f2129fa7` | `0572832729073581` |

All local ≠ prod → deploy required for Phase 2+/P0–P1/Phase 3 Butterfly fix to take effect.

## 2. Required environment variables

| Variable | Where | Notes |
|---|---|---|
| `AI_ENGINE_SERVICE_SECRET` / `CRM_SERVICE_SECRET` | ai_engine + backend + worker | Already required; must match |
| `SALON_API_URL` | ai_engine | Compose: `http://backend:5000/api` |
| Tenant Gemini key | DB `TenantAiSettings` (encrypted) | **Not** in container env today — keep as-is |
| Redis URL / session store | ai_engine | Unchanged |

No new env vars required for this package.

## 3. Database compatibility

| Item | Assessment |
|---|---|
| Migrations | **None** |
| Schema changes | **None** |
| Data writes by deploy | **None** (code hot-copy only) |
| Memory meta fields | Additive (`pricing_service_key`, pause fields) — backward compatible |

## 4. Deployment order (when approved)

1. Take rollback snapshot (see `PHASE4_ROLLBACK_PLAN.md`)  
2. `docker cp` AI files → `xanesalon-ai_engine-1:/app/app/`  
3. Restart **ai_engine** only; `/health`  
4. `docker cp` JS → **backend** `/app/services/`  
5. `docker cp` same JS → **ai_crm_worker** `/app/services/`  
6. Restart backend + worker (or reload if process model requires)  
7. Health checks (section 5)  
8. Authorized T28 WA smoke (`PHASE4_WHATSAPP_SMOKE_TEST_PLAN.md`)  

## 5. Health checks

- [ ] `ai_engine` container Up  
- [ ] `GET /health` on ai_engine → 200  
- [ ] Backend Up  
- [ ] Worker Up / processing queue  
- [ ] Internal ai-settings for tenant 28 reachable from ai_engine (no key logged)  
- [ ] One synthetic `/v1/turns` price ask returns `pricing_resolver` action (staging or authorized)  

## 6. Compatibility warning

Local pytest **does not** guarantee production compatibility. Prod currently lacks `pricing_resolver.py` and `conversation_intelligence.py`; behaviour will change for price asks and CI prompts after deploy. Keep rollback ready for 30+ minutes of observation.

## 7. Explicit non-actions

- No commit / push  
- No prod migrations  
- No staff activation changes  
- No catalogue price row edits as part of deploy  
- No other-tenant file targeting  
