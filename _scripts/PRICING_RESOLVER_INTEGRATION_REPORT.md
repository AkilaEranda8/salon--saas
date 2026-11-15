# Pricing Resolver Integration Report (Local)

**Tenant focus:** 28  
**Deploy ai_engine:** **No**  
**Date:** 2026-11-14

## What changed

| File | Change |
|---|---|
| `ai_engine/app/main.py` | `_maybe_pricing_resolver_reply` after booking SM, before Gemini |
| `ai_engine/app/pricing_resolver.py` | Marked as wired locally |
| `ai_engine/tests/test_pricing_*.py` | Official catalogue + conflict/unknown cases |

## Turn-path behaviour

1. Booking / cancel / reschedule SM runs first (unchanged).  
2. If SM returns `None` and message is a **price ask** (or length-tier service like Keratin):  
   - Load live `list_services`  
   - `resolve_price(...)`  
   - Reply deterministically (Singlish / EN / SI)  
3. Ambiguous price-only asks still fall through to Gemini (preserve behaviour).  
4. Conflicts / escalate → handoff hint `pricing_conflict_or_uncertain`.

## Precedence

Live active catalogue → official length tiers → ask length / escalate — **never invent**.

## Not deployed

Production `ai_engine` container still runs previous image until separate deploy approval.
