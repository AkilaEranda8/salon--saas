# Gemini Price Fallthrough Audit (Local Harden)

**Date:** 2026-11-14  
**Tenant fixture:** 28 catalogue (134 rows; 127 active after Phase 1 soft-deactivates)  
**Production:** **not** changed / not deployed  

---

## Before (gap)

| Path | Behaviour |
|---|---|
| `Facial mila?` / `Waxing how much?` | Resolver returned empty → **Gemini fallthrough** |
| Unknown service price | Could reach Gemini |
| `list_services` failure | Returned `None` → Gemini |

Risk: Gemini could emit unverified LKR amounts despite prompt rules.

---

## After (local harden)

| Control | Implementation |
|---|---|
| Price detection | `is_price_enquiry()` — EN / Singlish / SI + bare `Facial mila?` forms |
| Hard gate in `main.py` | Price asks always handled by `_maybe_pricing_resolver_reply` — **never** `return None` to invent |
| Catalogue unavailable | Escalate to staff (fail closed) |
| Unmatched price ask | Clarify which service — **no number** |
| Category asks (facial/wax/…) | Verified live list only |
| Length-tier (Keratin/…) | Official tiers / ask length |
| Belt-and-suspenders | `PRICE LOCK` system block if a price ask ever reaches Gemini |

### Fallthrough contract

For any `is_price_enquiry(msg) == True`:

1. Resolver returns one of: `ok` | `needs_length` | `needs_clarification` | `escalate`  
2. Action flag `gemini_price_fallthrough: false`  
3. No amount outside live catalogue ∪ official length tiers  

---

## Residual notes

- Category cue on nonsense like “quantum plasma **facial** price” may list verified facials (safe — still verified numbers).  
- Pure nonsense without category cue → clarify / escalate.  
- Code still local until deploy approval.  
