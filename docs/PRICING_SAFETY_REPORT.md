# Pricing Safety Report — Phase 2+

**Date:** 2026-11-14 · **Local only**

## Stack

1. Booking SM yields on price side-asks (paused).  
2. `pricing_resolver` hard-gate before Gemini (local).  
3. CI marks `INTENT_PRICE` + decision `verified_price`.  
4. PRICE LOCK system prompt if Gemini still sees a price ask.  
5. Official length tiers for keratin-class services.

## Guarantees

- 0 invented catalogue prices in resolver path.  
- Unknown service → clarify / escalate — never estimate.  
- Regression: existing pricing pytest suites still green.
