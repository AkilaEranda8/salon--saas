# Multi-Question Response Completeness — Root Cause Report

**Tenant:** 28 – Larvendo Salon  
**Production RC (unchanged):** `phase6_t28_rc3`  
**Fix candidate:** `phase6_t28_rc4` (**NOT DEPLOYED**)  
**Date:** 2026-11-14  

## Observed failures (production WA)

### Issue 1 — Hair Cut
**Customer:**  
`Mata hair cut ekak karaganna oni. Butterfly cut ekata kiyada? Layer cut ekath karanawada? Hair cut ekata kochchara wela yanawada?`

**Actual:** `Ladies Hair Cut-Butterfly: Rs 4,500 · 105 min.`

**Missing:** Layer availability/clarify · general Hair Cut · duration for general cut.

### Issue 2 — Facial
**Customer:**  
`Mata facial options tika kiyanna. Normal facial ekai Hydra facial ekai prices mokakda?`

**Actual:** `Normal Facial: Rs 4,500 · 90 min.`

**Missing:** Hydra Facial options/prices · multi-option comparison.

## Pipeline trace

| Step | Component | What happened |
|------|-----------|---------------|
| 1 | WA inbound → `WA_INBOUND_AI` | Full customer text preserved |
| 2 | Multi-intent (`_understand_customer_ask`) | Could mark `multi` / topics, but **price hard-gate bypasses Gemini** |
| 3 | Gemini prompt | **Not reached** for these turns |
| 4 | Live catalogue | Loaded correctly via `list_services` |
| 5 | `resolve_price` | **Early-returned first SKU only** (Butterfly / Normal Facial) |
| 6 | Response assembly | Single `PriceQuote` → one outbound line |
| 7 | WhatsApp outbound | Delivered the incomplete single line |

## Exact drop point

`ai_engine/app/main.py` → `_maybe_pricing_resolver_reply`  
→ `pricing_resolver.resolve_price`  

1. Butterfly regex matched → `return quote_fixed_row(butterfly)` **before** Layer / duration handled.  
2. Strong name match for `Normal Facial` → single fixed quote **before** Hydra family listed.

Secondary questions were never assembled into the customer-facing text.

## Fix (local RC4)

- `detect_multi_price_targets` — detect independent parts in one message.  
- `resolve_multi_price_ask` — assemble **one** verified multi-part reply (`price_kind=list`, `source=multi_price_ask`).  
- Layer missing → stylist confirmation (no invented Layer price).  
- Hydra → all distinct live rows (no merge).  
- Single-SKU asks (e.g. `Ladies Hair Cut-Butterfly price`) still use short quote path.

## Boundaries honored

- Production RC3 not modified  
- No prod restart  
- No WhatsApp during implementation  
- No customer data changes  
- No commit/push  
- Existing release folders preserved  

## STOP

Await explicit approval before deploy or live WA retest of `phase6_t28_rc4`.
