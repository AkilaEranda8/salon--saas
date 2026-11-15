# Phase 4C — Release Bundle Manifest

**RC ID:** `phase4c_t28_rc1`  
**Path:** `_release/phase4c_t28_rc1/`  
**Date:** 2026-11-14  
**Git commit:** Not created (no commit authorization)  
**Deploy:** Not executed

## Bundle contents (compatible set)

| Bundle path | sha16 | Role |
|---|---|---|
| `ai_engine/app/main.py` | `a73d79a65d9f9544` | Turn orchestration; hard-imports pricing + CI |
| `ai_engine/app/pricing_resolver.py` | `f38c616f83ac9873` | **CREATE** on prod — price hard-gate |
| `ai_engine/app/conversation_intelligence.py` | `b48ac76f091efb47` | **CREATE** on prod — CI context |
| `ai_engine/app/booking_flow.py` | `f70577c7fa077e1d` | Pause/yield, correction, media |
| `backend/services/crmInboundTurnService.js` | `ef40cdd7dd8b031a` | always_reply / inbound |
| `backend/services/crmAiMemoryService.js` | `f63ea110f2129fa7` | memory_patch + pricing_service_key |
| `worker/services/crmInboundTurnService.js` | `ef40cdd7dd8b031a` | **Same bytes** as backend (worker target) |
| `worker/services/crmAiMemoryService.js` | `f63ea110f2129fa7` | **Same bytes** as backend (worker target) |

All bundle files `matches_workspace: true` (see `_release/phase4c_t28_rc1/MANIFEST.json`).

## Known-good prod baseline (pre-deploy, for rollback)

| Prod path | sha16 |
|---|---|
| ai_engine `main.py` | `54fb1d8e327ad022` |
| ai_engine `booking_flow.py` | `1933294042289bf8` |
| ai_engine `pricing_resolver.py` | **absent** |
| ai_engine `conversation_intelligence.py` | **absent** |
| backend/worker `crmInboundTurnService.js` | `2cb7fab3b0dee5c4` |
| backend/worker `crmAiMemoryService.js` | `0572832729073581` |

Source: `_scripts/_phase4_prod_hashes.json`

## Dependencies

| Kind | Notes |
|---|---|
| Python packages | No new pip deps in CREATE modules |
| Node packages | No new npm deps in JS diffs |
| Env vars | No new required vars |
| DB migrations | None |
| Import order | See `DEPLOY_ORDER.txt` in bundle |

## Version control note

This RC is a **filesystem release candidate**, not a git tag. Commit/push requires separate authorization.
