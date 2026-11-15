# Phase 4 — Rollback Plan (Larvendo T28)

**Status:** DOCUMENTED — verify snapshot **at deploy time** (hashes below are pre-deploy baseline)  
**Host:** `46.62.135.100` / `xanesalon` compose  

## 1. Pre-deploy snapshot procedure

Create a timestamped folder on the server, e.g. `/root/xanesalon/_rollback/ai_phase4_YYYYMMDD_HHMM/`.

Copy **from running containers** before overwrite:

### ai_engine

```bash
mkdir -p /root/xanesalon/_rollback/ai_phase4_TS/ai_engine
docker compose exec -T ai_engine sh -c 'tar -c -C /app/app main.py booking_flow.py' \
  > /root/xanesalon/_rollback/ai_phase4_TS/ai_engine/core.tar
# pricing_resolver.py / conversation_intelligence.py may be absent — record that explicitly
docker compose exec -T ai_engine ls -la /app/app/pricing_resolver.py /app/app/conversation_intelligence.py || true
```

### backend + worker JS

```bash
mkdir -p /root/xanesalon/_rollback/ai_phase4_TS/backend /root/xanesalon/_rollback/ai_phase4_TS/worker
docker compose cp backend:/app/services/crmInboundTurnService.js /root/xanesalon/_rollback/ai_phase4_TS/backend/
docker compose cp backend:/app/services/crmAiMemoryService.js /root/xanesalon/_rollback/ai_phase4_TS/backend/
docker compose cp ai_crm_worker:/app/services/crmInboundTurnService.js /root/xanesalon/_rollback/ai_phase4_TS/worker/
docker compose cp ai_crm_worker:/app/services/crmAiMemoryService.js /root/xanesalon/_rollback/ai_phase4_TS/worker/
```

Record sha16 of each snapped file into `MANIFEST.txt`.

### Baseline prod hashes (2026-11-14, pre-deploy)

| Path | sha16 |
|---|---|
| ai_engine `main.py` | `54fb1d8e327ad022` |
| ai_engine `booking_flow.py` | `1933294042289bf8` |
| ai_engine `pricing_resolver.py` | **absent** |
| ai_engine `conversation_intelligence.py` | **absent** |
| backend/worker `crmInboundTurnService.js` | `2cb7fab3b0dee5c4` |
| backend/worker `crmAiMemoryService.js` | `0572832729073581` |

## 2. Rollback triggers

Execute rollback if any occur within observation window:

- False verified price (e.g. galaxy → Keratin; Butterfly → 3500)  
- False booking/cancel confirmation without DB proof  
- Lost pause / booking draft corruption  
- Cross-tenant symptoms  
- ai_engine crash loop / sustained 5xx  
- Duplicate mass replies  

## 3. Rollback execution order

1. Stop taking new WA tests; note ongoing conversations.  
2. Restore AI files from snapshot (or remove new modules if they did not exist):  
   - Restore `main.py`, `booking_flow.py`  
   - **Delete** `pricing_resolver.py` and `conversation_intelligence.py` if they were created by deploy and absent before  
3. Restart `ai_engine`; confirm `/health`.  
4. Restore JS on **backend** and **ai_crm_worker** from snapshot.  
5. Restart backend + worker.  
6. Re-check health + one known price ask behaviour matches pre-deploy.  
7. File incident note: time, trigger, hashes before/after.  

## 4. Verification after rollback

- [ ] Container hashes match pre-deploy baseline (or snapshot MANIFEST)  
- [ ] `/health` OK  
- [ ] Test number: simple `Hi` replies  
- [ ] No orphan confirmed appointments from failed deploy window (manual DB review)  

## 5. What rollback does NOT undo

- Appointments created/cancelled during the failed window (data) — handle manually  
- Customer messages already sent  

## 6. Verification of this plan

Plan reviewed against live prod layout via read-only hash probe (`_phase4_prod_hashes.json`).  
**Snapshot folder itself must be created at deploy time** — not created in Phase 4 (no prod writes).
