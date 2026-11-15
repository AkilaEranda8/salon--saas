# Phase 6 RC3 Deployment Execution Report — Larvendo T28

**RC:** `phase6_t28_rc3`
**Approval:** `deplyp` / deploy
**Started (UTC):** 2026-11-14T15:45:34.562397+00:00
**Finished (UTC):** 2026-11-14T15:46:38.575218+00:00
**Result:** SUCCESS
**WhatsApp:** NOT SENT
**Rollback snapshot:** `/root/xanesalon/_rollback/phase6_rc3_20261114_154539`

## Files deployed

- `ai_engine/app/catalogue_quality.py`
- `ai_engine/app/pricing_resolver.py`
- `ai_engine/app/booking_flow.py`
- `ai_engine/app/customer_respect.py`
- `ai_engine/app/main.py`
- `backend/services/crmHandoffInboundPolicy.js`
- `backend/services/crmInboundTurnService.js`

## Verify

```
PHASE6_AI_OK {"ids": [278, 238], "missing": ["layer"], "price": 4500, "handoff_snip": "Hari Sir, mama dan team ekata request ekak danawa. Podi welawak denna \u2014 confirm "}
PHASE6_WORKER_OK [true,true,true,true]
NAME                        IMAGE                     COMMAND                  SERVICE         CREATED        STATUS                    PORTS
xanesalon-ai_crm_worker-1   xanesalon-ai_crm_worker   "docker-entrypoint.s…"   ai_crm_worker   33 hours ago   Up 29 seconds             5000/tcp
xanesalon-ai_engine-1       xanesalon-ai_engine       "uvicorn app.main:ap…"   ai_engine       33 hours ago   Up 39 seconds (healthy)   8010/tcp
xanesalon-backend-1         xanesalon-backend         "docker-entrypoint.s…"   backend         28 hours ago   Up 29 seconds (healthy)   0.0.0.0:5001->5000/tcp, [::]:5001->5000/tcp

```

Evidence JSON: `_scripts/_phase6_rc3_deploy_evidence.json`
