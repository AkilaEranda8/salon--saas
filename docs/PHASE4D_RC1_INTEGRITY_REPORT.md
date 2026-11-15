# Phase 4D — RC1 Integrity Report

**Date:** 2026-11-14  
**Bundle:** `_release/phase4c_t28_rc1/`  
**RC modified during verification:** **NO**  
**Corrected candidate prepared:** **Not required** (no mismatches)

## Results

| Check | Result |
|---|---|
| MANIFEST.json vs on-disk release files | **PASS** — all 8 entries present; sha16 + bytes match |
| Files missing from disk | **None** |
| Workspace byte match (source of truth) | **PASS** — all 8 |
| Secrets / `.env` / gemini key inside bundle | **None** |
| Extra files on disk outside MANIFEST `files` | `MANIFEST.json`, `DEPLOY_ORDER.txt` only (expected meta) |

Evidence (outside bundle): `_scripts/_phase4d_rc1_integrity.json`

## DEPLOY_ORDER.txt vs dependency order

| Step | Order text | Dependency rule | Match |
|---|---|---|---|
| 1 | Snapshot | Rollback baseline | Yes |
| 2 | CREATE `pricing_resolver` + `conversation_intelligence` | Required before `main` import | Yes |
| 3 | REPLACE `booking_flow` then `main` | CI imports booking helpers; main imports both CREATE modules + booking | Yes |
| 4 | Restart ai_engine → `/health` | Startup after full Python set | Yes |
| 5 | REPLACE JS on backend **and** worker | Same inbound/memory code paths | Yes |
| 6 | Restart backend + worker | Apply JS | Yes |
| 7 | Authorized smoke | Post-deploy only | Yes |
| CRITICAL note | Never restart after only `main.py` | Prevents ImportError outage | Yes |

**DEPLOY_ORDER verification: PASS**

## Conclusion

RC1 integrity is intact. No separate corrected candidate is needed.
