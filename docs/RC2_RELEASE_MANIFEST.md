# RC2 Release Manifest — phase4c_t28_rc2

**RC ID:** `phase4c_t28_rc2`  
**Parent:** `phase4c_t28_rc1` (**immutable — not modified**)  
**Created (UTC):** 2026-11-14T11:47:23Z  
**Bundle path:** `_release/phase4c_t28_rc2/`  
**Tenant:** 28  

## Why RC2

Pricing safety gate + output validation after Phase 4D residual (Gemini Keratin shoulder Rs 15,000 vs official Rs 25,000).

## Changed vs RC1

| File | RC1 sha16 | RC2 sha16 |
|---|---|---|
| `ai_engine/app/main.py` | a73d79a65d9f9544 | **1a3a251f5bdaaed7** |
| `ai_engine/app/pricing_resolver.py` | f38c616f83ac9873 | **27fa6ab72c6b5b6a** |

Unchanged from RC1 (copied with matching hashes):  
`conversation_intelligence.py`, `booking_flow.py`, backend+worker `crmInboundTurnService.js`, `crmAiMemoryService.js`.

## Artifacts in bundle

- `MANIFEST.json` — full SHA-256 per file  
- `SHA256SUMS.txt` — checksum list  
- `DEPLOY_ORDER.txt` — same order as RC1 + RC2/rollback note  
- Import smoke: **ok** (`pricing_resolver`, `conversation_intelligence`, `booking_flow`, `main`)

## Deploy order (DO NOT EXECUTE without approval)

1. Snapshot prod.  
2. CREATE `pricing_resolver.py`, `conversation_intelligence.py` on ai_engine.  
3. REPLACE `booking_flow.py`, `main.py` on ai_engine.  
4. Restart ai_engine → `/health` 200.  
5. REPLACE backend **and** worker CRM services.  
6. Restart backend + worker.  
7. Authorized T28 WhatsApp smoke only after approval.

**Critical:** Never restart ai_engine after copying only `main.py`.

## Rollback

Redeploy RC1 files from `_release/phase4c_t28_rc1/` (checksums unchanged). RC2 does not alter RC1.

## Compatibility

- Backend/worker memory patch + inbound turn services unchanged from RC1.  
- AI engine pricing APIs remain internal; customers do not see resolver metadata.
