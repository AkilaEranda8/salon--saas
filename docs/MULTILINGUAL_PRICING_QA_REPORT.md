# Multilingual Pricing QA Report

**Date:** 2026-11-14  
**Tenant:** 28  
**Scope:** English / Singlish / Sinhala price asks through `pricing_resolver`  

## Executed evidence

| Suite | Result |
|---|---|
| `test_gemini_price_leakage_guard` multilingual keratin params | PASS |
| `test_pricing_fallthrough_safety` language cues | PASS (included in 25-case filtered run) |
| Behaviour harness price EN / Singlish / SI | **PASS** (3/3 price rows in 17/17) |
| Real adversarial SG: `Keratin shoulder mila kiyada?` | Customer **[25000]** |
| Real adversarial SI path (deterministic): `කෙරටින් shoulder මිල` | **25000** |

## Matrix

| Message | Language | Expected | Observed |
|---|---|---|---|
| Keratin shoulder price? | EN | 25000 | 25000 |
| Keratin shoulder mila | Singlish | 25000 | 25000 |
| කෙරටින් shoulder මිල | Sinhala+EN length | 25000 | 25000 |
| Keratin kiyada? Shoulder length | Singlish | 25000 | 25000 |
| Is keratin shoulder Rs 15000? | EN assert | Not 15000; resolve 25000 or clarify | 25000 |
| Galaxy Plasma… price kiyada? | Singlish | No quote | No amount |
| Bra Strap + keratin memory | EN length | 30000 | 30000 |
| Behaviour: price enquiry EN/SG/SI | intent/script | chat + matching script | PASS |

## Clarification behaviour

- Missing length (`Keratin kiyada?`) → `needs_length` (Shoulder / Bra Strap / Hip).  
- Unknown named service (Galaxy) → clarify / no false Keratin tier.  
- Fallback strings (EN/SG/SI) contain **zero** LKR amounts.

## Gaps (non-blocking)

Full live WhatsApp multilingual smoke on Tenant 28 was **not** sent (boundary). Staging WA smoke remains a release condition.
