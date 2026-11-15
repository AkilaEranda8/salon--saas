# RC2 — Production Snapshot Checklist

**Status:** OPERATOR ACTION REQUIRED at deploy time  
**Authorization:** NOT AUTHORIZED by this document — execute only after explicit deploy approval  
**Purpose:** Backup immediately **before** overwriting production with `_release/phase4c_t28_rc2/`  
**Host context:** `46.62.135.100` / `xanesalon` compose (see `PHASE4_ROLLBACK_PLAN.md`)  

## Boundaries

- Do **not** create snapshots until an authorized operator starts an approved deploy window.  
- Do **not** dump or copy production API keys into chat, git, or the RC2 bundle.  
- Do **not** modify RC1 or RC2 release trees while snapshotting.  

## 1. Snapshot folder

- [ ] Create timestamped dir: `/root/xanesalon/_rollback/phase4c_rc2_YYYYMMDD_HHMM/`  
- [ ] Record operator name, ticket/approval id, UTC time in `SNAPSHOT_META.txt`

## 2. Application / AI engine files

From running `ai_engine` container (or bind-mount path used in compose):

- [ ] `main.py`  
- [ ] `booking_flow.py`  
- [ ] `pricing_resolver.py` (copy if present; else record **ABSENT**)  
- [ ] `conversation_intelligence.py` (copy if present; else record **ABSENT**)  
- [ ] SHA-256 (or sha16) of each into `MANIFEST.txt`

## 3. Backend and worker versions

- [ ] `backend` → `services/crmInboundTurnService.js`  
- [ ] `backend` → `services/crmAiMemoryService.js`  
- [ ] `ai_crm_worker` → `services/crmInboundTurnService.js`  
- [ ] `ai_crm_worker` → `services/crmAiMemoryService.js`  
- [ ] Note image tags / compose service versions in `SNAPSHOT_META.txt`  
- [ ] Hash each JS file into `MANIFEST.txt`

## 4. Database backup (no secret leakage)

- [ ] Logical backup of Tenant-28–relevant schemas/tables used by CRM booking (appointments, conversations as applicable) — **authorized DB access only**  
- [ ] Store dump under snapshot dir with restricted permissions (`chmod 600`)  
- [ ] Do **not** include full secret tables if policy forbids; prefer booking/conversation tables needed for incident recovery  
- [ ] Record DB engine, dump tool, and restore dry-run command in `RESTORE.md`  
- [ ] Confirm RC2 has **no migrations** (rollback needs no reverse migration)

## 5. Environment / configuration (secure handling)

- [ ] Inventory compose env file paths / secret names (list **names only**, not values)  
- [ ] Backup env files to a **restricted** path outside git (e.g. `/root/xanesalon/_rollback/.../env/`) with `600` perms  
- [ ] Never commit env backups; never copy into `_release/**`  
- [ ] Confirm Gemini/prod keys are not printed to terminal history if avoidable  

## 6. Current production file hashes

- [ ] Compute hashes of live files **before** overwrite  
- [ ] Compare to known Phase 4C pre-deploy baseline if still applicable:

| Artifact | Prior baseline sha16 (pre–Phase 4C) |
|---|---|
| `main.py` | `54fb1d8e327ad022` |
| `booking_flow.py` | `1933294042289bf8` |
| `pricing_resolver.py` | absent |
| `conversation_intelligence.py` | absent |
| `crmInboundTurnService.js` | `2cb7fab3b0dee5c4` |
| `crmAiMemoryService.js` | `0572832729073581` |

- [ ] If production already differs (partial prior deploy), **trust this snapshot’s MANIFEST**, not the old table alone

## 7. Service / process / Nginx configuration

- [ ] Save `docker compose` file(s) used for `ai_engine`, `backend`, `ai_crm_worker`  
- [ ] Record restart commands and health endpoints (`GET /health` on ai_engine)  
- [ ] Where applicable: copy nginx site config for WA/API reverse proxy (no cert private keys into git)  
- [ ] Note process manager (compose/systemd) unit names  

## 8. Backup verification

- [ ] Re-read each snapped file; hash matches `MANIFEST.txt`  
- [ ] Tar/archive snapshot and verify list contents  
- [ ] Confirm restore procedure documented (Section 9)  
- [ ] Second operator or self-check: folder non-empty, permissions restricted  

## 9. Restoration procedure (rollback)

1. Stop taking new WA tests.  
2. Restore ai_engine files from this snapshot; restart ai_engine → `/health` 200.  
3. If rolling to pre-pricing baseline and modules were absent before RC deploy: remove `pricing_resolver.py` / `conversation_intelligence.py` after restoring old `main.py`.  
4. Restore backend + worker JS from snapshot; restart both.  
5. Re-check hashes vs snapshot `MANIFEST.txt`.  
6. DB: restore dump **only if** data corruption warrants and approval is given (appointments created during failed window may need manual review instead).  
7. File incident note: trigger, times, hashes before/after.

## 10. Sign-off

| Role | Name | Date | Result |
|---|---|---|---|
| Operator | | | Snapshot complete / incomplete |
| Reviewer | | | Verified / rejected |

**Deploy approval id:** ________________  
