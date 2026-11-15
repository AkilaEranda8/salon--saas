# Full Regression Test Results — Phase 2/3 local

**Date:** 2026-11-14  
**Command:** `pytest tests/test_pricing_*.py tests/test_booking_*.py tests/test_flows_intent_lang.py`

## Summary

| Suite | Passed |
|---|---|
| Pricing resolver unit | ✅ |
| Pricing integration / conflict / unknown | ✅ |
| Booking confirm tokens | ✅ |
| Booking idempotency / double-book / API fail | ✅ 3/3 |
| Flows intent / cancel / reschedule / lang | ✅ |
| **Total pytest** | **72/72** |
| Behaviour harness (intent/script/handoff) | **17/17 (100%)** |

## Deploy / git

- ai_engine **not** deployed  
- **No** commit / push  

## Remaining production risks

1. **Code/DB skew:** KB duration fix is live; pricing resolver + booking polish are **local only** — production AI won't use them until deploy.  
2. Single active stylist (Nadeeka) unchanged.  
3. Google KB bodies may still list other noisy catalogue rows (duration for Ladies Cut fixed).  
4. Pricing resolver not yet covering every category (facials packages, etc.) — falls through to Gemini.  
5. No live WhatsApp smoke of new turn path (requires deploy).  
6. Stylist preference still disabled (by design).  

## Next approvals (suggested)

```
[ ] Deploy ai_engine (pricing + booking polish)
[ ] Live WhatsApp smoke (price + book + cancel)
[ ] Expand pricing catalogue coverage
[ ] Phase 4 automations
```
