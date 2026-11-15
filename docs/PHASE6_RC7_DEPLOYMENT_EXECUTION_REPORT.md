# Phase 6 RC7 Deployment Execution Report — Larvendo T28

**RC:** `phase6_t28_rc7`
**Approval:** `commit and deploy`
**Started (UTC):** 2026-11-15T03:25:02.229505+00:00
**Finished (UTC):** 2026-11-15T03:26:01.901236+00:00
**Result:** SUCCESS
**WhatsApp:** NOT SENT
**Rollback snapshot:** `/root/xanesalon/_rollback/phase6_rc7_20261115_032504`

## Files deployed

- `ai_engine/app/conversation_truth.py`
- `ai_engine/app/turn_planner.py`
- `ai_engine/app/turn_trace.py`
- `ai_engine/app/response_quality.py`
- `ai_engine/app/conversation_intelligence.py`
- `ai_engine/app/pricing_resolver.py`
- `ai_engine/app/booking_flow.py`
- `ai_engine/app/main.py`
- `backend/services/crmHandoffInboundPolicy.js`
- `backend/services/crmAiMemoryService.js`

## Verify

```
PHASE6_RC7_AI_OK {"date": "2026-12-05", "rel": "2026-12-05", "pick": null, "ni": "date_day", "units": 3}
PHASE6_RC7_WORKER_OK [true,true,true]
NAME                        IMAGE                     COMMAND                  SERVICE         CREATED        STATUS                    PORTS
xanesalon-ai_crm_worker-1   xanesalon-ai_crm_worker   "docker-entrypoint.s…"   ai_crm_worker   45 hours ago   Up 32 seconds             5000/tcp
xanesalon-ai_engine-1       xanesalon-ai_engine       "uvicorn app.main:ap…"   ai_engine       45 hours ago   Up 41 seconds (healthy)   8010/tcp
xanesalon-backend-1         xanesalon-backend         "docker-entrypoint.s…"   backend         39 hours ago   Up 31 seconds (healthy)   0.0.0.0:5001->5000/tcp, [::]:5001->5000/tcp

```

Evidence JSON: `_scripts/_phase6_rc7_deploy_evidence.json`
