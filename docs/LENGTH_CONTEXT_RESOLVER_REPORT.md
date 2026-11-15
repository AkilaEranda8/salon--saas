# Length-Context Resolver Report — Larvendo T28

**Date:** 2026-11-14  
**Scope:** Local only — no deploy / restart / commit / push  
**Trigger:** Independent QA — `Bra Strap` after Keratin bypassed `pricing_resolver`

## Root cause

1. `is_price_enquiry("Bra Strap")` is false → `_maybe_pricing_resolver_reply` returned `None`.
2. Pricing turns that asked length returned early **before** CI, so `pricing_service_key` was never written to memory.
3. Resolver had no `prior_service_key` / memory argument for length-only follow-ups.

## Fix

| Layer | Change |
|---|---|
| `pricing_resolver.py` | `is_length_only_message`, `resolve_service_key_from_memory`, `resolve_price(..., prior_service_key=, memory=)` section 0b |
| `main.py` | Enter hard-gate on length-only; pass memory; emit `pricing_memory_patch` action |
| `crmAiMemoryService.js` | Merge `pricing_memory_patch` into `meta.pricing_service_key` |

Flow:

1. `Keratin kiyada?` → resolver `needs_length` + `service_key=keratin` + memory patch.
2. Customer: `Bra Strap` → length-only + memory key → official tier Rs 30,000 (hard-gate, not Gemini).
3. No memory key → clarify which service (never length-alone invent).

## Tests

- Multi-turn keratin → Bra Strap (unit + independent QA `S1` / `S10`)
- Length-only without memory → clarify
- Non-approved memory (`galaxy plasma`) → ignored

## Acceptance

- Length-only resolver bypass: **0** when `pricing_service_key` is present in structured memory
- Does **not** depend on Gemini history text alone
