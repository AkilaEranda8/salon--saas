# Phase 6 RC9a Deployment Execution Report — Larvendo T28

**RC:** `phase6_t28_rc9a`  
**Commits:** `3cfb40f` (ship), `91b9243` (export hotfix)  
**Approval:** `commit and deploy`  
**Result:** **SUCCESS** (after controller export hotfix)  
**WhatsApp:** NOT SENT  
**Rollback snapshot:** `/root/xanesalon/_rollback/phase6_rc9a_20261115_044341`

## What shipped

- RC9a conversation memory / direct-answer / audit hotfixes
- RC8 Gemini cost router + budget ledger (required by `main.py`)
- CRM memory merge helpers + ai-budget analytics route
- AI engine / backend / worker restarted

## Verify

```
PHASE6_RC9A_AI_OK
PHASE6_RC9A_BE_OK
PHASE6_RC9A_WORKER_OK
backend: Up (healthy) after export hotfix
EXPORT_OK for getAiBudgetDashboard
```

## Incident during deploy

`crm.js` registered `GET /analytics/ai-budget` → `getAiBudgetDashboard`, but `module.exports` omitted the handler → Express boot crash (`Route.get() … Undefined`).

**Fix:** export `getAiBudgetDashboard` (`91b9243`), re-copy controller, restart backend → healthy.

## Evidence

`_scripts/_phase6_rc9a_deploy_evidence.json`
