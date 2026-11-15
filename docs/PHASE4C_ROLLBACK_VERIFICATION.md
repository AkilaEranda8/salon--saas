# Phase 4C — Rollback Verification

**Date:** 2026-11-14  
**Status:** Documented and hash-verified against live prod baseline  
**Snapshot folder on server:** Not created (no prod writes in Phase 4C)

## Pre-deployment snapshot requirements

Before any overwrite on `46.62.135.100`:

1. Create `/root/xanesalon/_rollback/phase4c_TS/`  
2. Copy from containers:  
   - ai_engine: `main.py`, `booking_flow.py`  
   - Note absence of `pricing_resolver.py` / `conversation_intelligence.py`  
   - backend + worker: both JS services  
3. Write `MANIFEST.txt` with sha16 of each file  
4. Confirm matches known-good baseline below  

## Previous known-good application versions (prod now)

| Artifact | sha16 |
|---|---|
| `main.py` | `54fb1d8e327ad022` |
| `booking_flow.py` | `1933294042289bf8` |
| `pricing_resolver.py` | absent |
| `conversation_intelligence.py` | absent |
| `crmInboundTurnService.js` | `2cb7fab3b0dee5c4` |
| `crmAiMemoryService.js` | `0572832729073581` |

## Database compatibility

- Deploy introduces **no migrations**.  
- Rollback needs **no DB reverse migration**.  
- Additive memory meta keys remain harmless if left in place.

## Rollback order

1. Restore ai_engine `main.py` + `booking_flow.py` from snapshot.  
2. **Delete** `pricing_resolver.py` and `conversation_intelligence.py` if they were created by the RC deploy.  
3. Restart ai_engine → `/health` 200.  
4. Restore both JS files on **backend** and **ai_crm_worker**.  
5. Restart backend + worker.  
6. Verify hashes == baseline; send authorized test `Hi` only if WA auth exists.

## Health-check failure conditions → rollback

- ai_engine not Up / `/health` ≠ 200  
- ImportError / crash loop in logs  
- Sustained 5xx on `/v1/turns`  
- False verified prices or false book/cancel in smoke  
- Cross-tenant anomalies  

## Recovery verification checklist

- [ ] File sha16 match baseline MANIFEST  
- [ ] `/health` OK  
- [ ] Worker processing inbound  
- [ ] No orphan confirmed appointments from failed window (manual DB review)  

## Verification of this document

Prod hashes refreshed in Phase 4 (`_phase4_prod_hashes.json`) and used as known-good.  
Rollback steps are compatible with “CREATE files were absent before deploy.”
