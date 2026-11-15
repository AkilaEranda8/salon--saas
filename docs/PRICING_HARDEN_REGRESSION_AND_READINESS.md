# Regression Results + Deployment Readiness Recommendation

**Date:** 2026-11-14  
**Scope:** Gemini price fallthrough harden (local)  
**Deploy / restart / commit / push:** **NOT done**

## Regression

| Suite | Result |
|---|---|
| Pricing fallthrough safety | PASS |
| Pricing resolver + integration | PASS |
| Booking idempotency / double-book / API fail | PASS |
| Flows intent / cancel / reschedule / lang | PASS |
| Booking confirm tokens | PASS |
| **Pytest total** | **99/99** |
| Behaviour harness (book/cancel/lang/handoff) | **17/17** |

Booking and conversation behaviour preserved (SM still first; pricing gate only on price asks).

## Files changed (local)

- `ai_engine/app/pricing_resolver.py` — expanded detection, catalogue/category matching, clarify/escalate  
- `ai_engine/app/main.py` — hard gate + PRICE LOCK; no Gemini invent path on price asks  
- `ai_engine/tests/test_pricing_fallthrough_safety.py` — new  
- `ai_engine/tests/fixtures/t28_services.json` — T28 catalogue fixture  

## Deployment readiness recommendation

| Item | Status |
|---|---|
| Soft blocker from prior approval report (Gemini invent on facial/wax…) | **Resolved locally** |
| KB #27/#28 45-min correction | Still intact in prod DB (untouched this step) |
| Staff reactivation | None |
| Migrations | None |
| Recommended next step | Explicit approval to deploy `pricing_resolver.py` + `main.py` + `booking_flow.py` per `docs/AI_ENGINE_DEPLOYMENT_APPROVAL_REPORT.md` |

### Recommendation

**READY for production deploy approval** of the ai_engine package (pricing resolver + booking polish + this harden), subject to:

1. Pre-deploy file snapshot / rollback dir  
2. Restart `ai_engine` only  
3. Post-deploy T28 WhatsApp smoke (facial/wax/keratin/haircut/book/cancel)

Still requires **separate explicit deploy approval**. Do not deploy until then.
