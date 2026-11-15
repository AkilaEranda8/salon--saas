# RC3 Production Readiness Report — Phase 6 (`phase6_t28_rc3`)

**Candidate:** `_release/phase6_t28_rc3/`  
**Tenant:** 28  
**Production status:** **NOT READY TO DEPLOY WITHOUT APPROVAL**  
**Created:** 2026-11-14 (local packaging)

## Naming note

Brief asked for “RC3” relative to Phase 6 / RC2 baseline.  
Existing immutable `phase4c_t28_rc3`…`rc5` folders were **not** overwritten.  
This candidate is packaged as **`phase6_t28_rc3`**.

## Parent / immutability

| Artifact | Status |
|----------|--------|
| `phase4c_t28_rc2` | Immutable — preserved |
| `phase4c_t28_rc3`…`rc5` | Immutable — preserved |
| Production | Unchanged by this packaging |
| `phase6_t28_rc3` | Local candidate only |

## Package contents (deployable)

1. `ai_engine/app/catalogue_quality.py` (**new**)  
2. `ai_engine/app/pricing_resolver.py`  
3. `ai_engine/app/booking_flow.py`  
4. `ai_engine/app/customer_respect.py`  
5. `ai_engine/app/main.py`  
6. `backend/services/crmHandoffInboundPolicy.js` (+ worker mirror)  
7. `backend/services/crmInboundTurnService.js` (+ worker mirror)  

See `MANIFEST.json`, `SHA256SUMS.txt`, `DEPLOY_ORDER.txt`.

## Readiness checklist

| Item | Status |
|------|--------|
| Local tests (Phase 6 + related) | PASS |
| Import smoke | PASS |
| Keratin pricing protection | Intact (related suite PASS) |
| T28 isolation | Intact |
| Live Butterfly 278 @ 4500 revalidated | Yes (read-only) |
| Facial merge/delete | Not done (correct) |
| Production deploy | **Blocked** — needs approval |
| Live WhatsApp smoke | **Blocked** — needs approval |
| Commit / push | **Not done** |

## Deploy prerequisites (when approved)

1. Explicit deploy approval message  
2. Follow `DEPLOY_ORDER.txt`  
3. Restart `ai_engine`, `ai_crm_worker`, `backend` only after copy  
4. Separate approval before any WA smoke  
5. Do not overwrite phase4c RC folders  

## Recommendation

**HOLD.** Review reports, then approve deploy of `phase6_t28_rc3` if accepted.
