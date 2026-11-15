# RC2 Deployment Execution Report

**Project:** Larvendo Salon AI  
**Tenant:** 28 – Salon Larvendo Pvt LTD  
**Bundle:** `_release/phase4c_t28_rc2/`  
**Approval:** `APPROVED TO DEPLOY RC2`  
**Date (UTC):** 2026-11-14  
**Evidence:** `_scripts/_rc2_deploy_evidence.json`  

## Result

**DEPLOY COMPLETE — hashes match RC2**

| Check | Result |
|---|---|
| Pre-deploy snapshot | `/root/xanesalon/_rollback/phase4c_rc2_20261114_120324` |
| AI CREATE (`pricing_resolver`, `conversation_intelligence`) | Done |
| AI REPLACE (`main`, `booking_flow`) | Done |
| ai_engine restart + import smoke | `IMPORT_OK` |
| ai_engine container | Up **(healthy)** port 8010 |
| Backend + worker JS replace | Done |
| backend / ai_crm_worker | Up **(healthy)** / Up |
| Post-deploy sha16 vs RC2 | **MATCH** |
| WhatsApp smoke | **NOT SENT** (not authorized) |
| Commit/push | Not performed |

## Post-deploy sha16 (production)

| File | sha16 |
|---|---|
| `ai_engine/app/main.py` | `1a3a251f5bdaaed7` |
| `ai_engine/app/pricing_resolver.py` | `27fa6ab72c6b5b6a` |
| `ai_engine/app/conversation_intelligence.py` | `b48ac76f091efb47` |
| `ai_engine/app/booking_flow.py` | `f70577c7fa077e1d` |
| `backend/.../crmInboundTurnService.js` | `ef40cdd7dd8b031a` |
| `backend/.../crmAiMemoryService.js` | `f63ea110f2129fa7` |
| worker copies | same as backend |

## Rollback

Restore from snapshot dir above (preferred), or RC1 bundle if needed. See `RC2_PRODUCTION_SNAPSHOT_CHECKLIST.md` §9.

## Next (separate authorization)

Authorized Tenant 28 WhatsApp smoke only after:  
`APPROVED FOR WHATSAPP SMOKE ONLY` (or equivalent explicit WA auth).

## Notes

- Health HTTP probe initially missed port **8010**; container status **healthy** + `IMPORT_OK` confirmed.  
- DB: best-effort schema note only; no migrations applied.  
- RC1 release tree was not modified.  
