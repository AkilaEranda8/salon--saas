# Pricing False-Quote Fix Report — Larvendo T28

**Date:** 2026-11-14  
**Scope:** Local only — no deploy / restart / commit / push  
**Trigger:** Independent QA A5 — `galaxy plasma treatment how much?` → Keratin Rs 25,000

## Root cause

`resolve_price` section 4 used `match_services_by_category`. When a named unknown service contained a category word (`treatment`) and the live catalogue had a **single** matching SKU (Keratin Treatment), the resolver called `quote_fixed_row` and returned a verified-looking price for the wrong service.

## Fix

File: `ai_engine/app/pricing_resolver.py`

1. **Never auto-pick a single SKU from category alone.**
2. **Generic category asks** (`facial mila`, `waxing how much`) → verified **list** only (`_format_list`).
3. **Named / distinctive unknowns** that merely trigger a category cue → `clarify_unknown_named_service` (no amount).
4. Helpers: `is_generic_category_price_ask`, `_distinctive_tokens`, `_CATEGORY_GENERIC_TOKENS`.

## Evidence

| Ask | Before | After |
|---|---|---|
| Galaxy Plasma Treatment price kiyada? | Keratin Rs 25,000 | Clarify — not on verified list |
| Facial mila? | List (or single if one) | Verified list |
| Hydra Facial price? | Fixed 5,500 | Fixed 5,500 (exact name) |
| Keratin kiyada? | Needs length | Needs length (alias) |

## Tests

- `tests/test_pricing_false_quote_and_length_context.py`
- `tests/test_pricing_conversation_edge_100.py` (100+ edges)
- Independent QA `S9_galaxy_false_quote` + architecture `A5` **PASS**

## Acceptance

- Incorrect service-to-price mapping for unknown named services: **0** (local suite)
- Unverified invent amounts on those paths: **0**
