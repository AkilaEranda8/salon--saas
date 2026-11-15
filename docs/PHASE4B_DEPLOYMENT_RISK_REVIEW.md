# Phase 4B — Deployment Risk Review (Larvendo T28)

**Date:** 2026-11-14  
**Status:** Review only — **no deploy executed**

## Risk register

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | Deploy `main.py` without CREATE modules → ai_engine ImportError / outage | **Critical** | High if order wrong | CREATE `pricing_resolver` + `conversation_intelligence` **before** restart; health-check gate |
| R2 | New `main` + old `booking_flow` → AttributeError / broken pause/correction | **High** | High if partial copy | Always ship booking_flow with main |
| R3 | Update backend JS but not `ai_crm_worker` → inconsistent memory / always_reply | **High** | Medium | Copy JS to **both** containers |
| R4 | Live Gemini quality unknown (gate BLOCKED) → bad WA replies post-deploy | **High** | Unknown | Complete Phase 4B real Gemini **or** explicit waiver |
| R5 | Behaviour change for all price asks (hard-gate) surprises ops | **Medium** | Certain | Pre-brief + smoke B1–B3 |
| R6 | Length memory depends on `pricing_memory_patch` merge in JS | **Medium** | Medium | Deploy JS with AI; verify Bra Strap after Keratin on smoke |
| R7 | Rollback incomplete (leave CREATE files with old main) | **Medium** | Low | Rollback plan deletes CREATE files if pre-deploy absent |
| R8 | Cross-tenant regression | **High** | Low (code scoped) | Post-deploy spot-check other tenant |
| R9 | False book/cancel if tool layer fails | **High** | Low | Smoke E1–E3 require DB proof |
| R10 | Local pytest ≠ prod catalogue drift | **Medium** | Medium | Re-export T28 services if SKUs changed since fixture |

## Do / Don’t

**Do**

- Snapshot hashes before overwrite  
- Follow CREATE → REPLACE → restart → JS both → restart → smoke  
- Keep rollback folder ready for 30+ minutes  

**Don’t**

- Restart ai_engine after copying only `main.py`  
- Skip worker JS  
- Treat stub QA as live Gemini proof  
- Deploy without explicit approval  

## Go / No-Go inputs

| Input | Current |
|---|---|
| Local package tests | Green (481 / 17 / 12) |
| Real Gemini | **BLOCKED** |
| Compatibility understanding | Documented |
| Rollback plan | Documented |
| Explicit deploy approval | **Not given** |

**Recommendation:** **NO-GO for production deploy** until Gemini gate unblocked **or** product owner explicitly waives live Gemini validation in writing.
