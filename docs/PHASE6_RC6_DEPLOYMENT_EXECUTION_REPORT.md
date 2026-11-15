# Phase 6 RC6 Deployment Execution Report — Larvendo T28

**RC:** `phase6_t28_rc6`
**Approval:** `all commit and deploy`
**Started (UTC):** 2026-11-15T02:43:56.115833+00:00
**Finished (UTC):** 2026-11-15T02:44:49.609479+00:00
**Result:** SUCCESS
**WhatsApp:** NOT SENT
**Rollback snapshot:** `/root/xanesalon/_rollback/phase6_rc6_20261115_024358`

## Files deployed

- `ai_engine/app/response_quality.py`
- `ai_engine/app/conversation_intelligence.py`
- `ai_engine/app/pricing_resolver.py`
- `ai_engine/app/booking_flow.py`
- `ai_engine/app/main.py`
- `backend/services/crmHandoffInboundPolicy.js`

## Verify

```
PHASE6_RC6_AI_OK {"units": 3, "bad": false, "good": true, "intent": "price_enquiry"}
PHASE6_RC6_WORKER_OK [true,true,true]
NAME                        IMAGE                     COMMAND                  SERVICE         CREATED        STATUS                    PORTS
xanesalon-ai_crm_worker-1   xanesalon-ai_crm_worker   "docker-entrypoint.s…"   ai_crm_worker   44 hours ago   Up 29 seconds             5000/tcp
xanesalon-ai_engine-1       xanesalon-ai_engine       "uvicorn app.main:ap…"   ai_engine       44 hours ago   Up 39 seconds (healthy)   8010/tcp
xanesalon-backend-1         xanesalon-backend         "docker-entrypoint.s…"   backend         39 hours ago   Up 29 seconds (healthy)   0.0.0.0:5001->5000/tcp, [::]:5001->5000/tcp

```

Evidence JSON: `_scripts/_phase6_rc6_deploy_evidence.json`
