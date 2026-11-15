# Phase 6 RC4 Deployment Execution Report — Larvendo T28

**RC:** `phase6_t28_rc4`
**Approval:** `deploy karann` / deploy
**Started (UTC):** 2026-11-15T02:05:16.509521+00:00
**Finished (UTC):** 2026-11-15T02:06:08.460887+00:00
**Result:** SUCCESS
**WhatsApp:** NOT SENT
**Rollback snapshot:** `/root/xanesalon/_rollback/phase6_rc4_20261115_020518`

## Files deployed

- `ai_engine/app/pricing_resolver.py`
- `ai_engine/app/booking_flow.py`
- `ai_engine/app/main.py`
- `backend/services/crmHandoffInboundPolicy.js`

## Verify

```
PHASE6_RC4_AI_OK {"rej": true, "enq": false, "ude": "09:00", "clear": true, "heya": "2026-11-16", "heya_clear": true, "book_ok": true, "an_typo": "08:30", "end": "13:30", "tot": 105, "period_only": true, "slot_snip": "Together: *Cut + Facial* \u2014 about *~105 min* (Cut 45m, Facial 60m).\n*Afternoon* start times on 2026-11-15:\n*Afternoon:* 1"}
PHASE6_RC4_WORKER_OK [true,true,true,true]
NAME                        IMAGE                     COMMAND                  SERVICE         CREATED        STATUS                    PORTS
xanesalon-ai_crm_worker-1   xanesalon-ai_crm_worker   "docker-entrypoint.s…"   ai_crm_worker   43 hours ago   Up 29 seconds             5000/tcp
xanesalon-ai_engine-1       xanesalon-ai_engine       "uvicorn app.main:ap…"   ai_engine       43 hours ago   Up 39 seconds (healthy)   8010/tcp
xanesalon-backend-1         xanesalon-backend         "docker-entrypoint.s…"   backend         38 hours ago   Up 29 seconds (healthy)   0.0.0.0:5001->5000/tcp, [::]:5001->5000/tcp

```

Evidence JSON: `_scripts/_phase6_rc4_deploy_evidence.json`
