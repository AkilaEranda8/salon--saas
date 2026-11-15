# Category Mixing Regression Report — Larvendo T28

**Date:** 2026-11-14  
**Suite:** `ai_engine/tests/test_customer_intent_category_filtering.py`  
**Catalogue fixture:** `ai_engine/tests/fixtures/t28_services.json`  
**Result:** **33 passed**

---

## 1. Purpose

Prove that customer category intent never mixes unrelated live categories — especially that Hair Cut responses never include Facials rows that matched the production incident.

---

## 2. Forbidden Facial shortlist (production incident)

These must never appear for Hair Cut intents:

- Aroma Magic Gold Facial  
- Clean-up  
- Fox C Peel Treatment  
- Gold/Diamond Facial  
- Hydra Facial  
- Normal Facial  

Enforced by `_assert_no_facials()` on Hair Cut resolutions.

---

## 3. Case matrix

| # | Input | Expected intent | Expected categories | Result |
|---|---|---|---|---|
| 1 | Mata hair cut ekak oni | haircut | Hair Cut only | PASS |
| 2 | Hair cut ekak kara ganna oni | haircut | Hair Cut only | PASS |
| 3 | I need a haircut | haircut | Hair Cut only | PASS |
| 4 | Mata facial ekak oni | facial | Facials* only | PASS |
| 5 | Keratin karanna oni | keratin | Hair Treatment (Keratin) | PASS |
| 6 | Hair colour karanna oni | color | Fashion Colours / Grey Hair Cover | PASS |
| 7 | Layer cut thiyenawada? | haircut | empty or Hair Cut (no Facials) | PASS |
| 8 | Hair Cut → “Na, mata facial ekak oni” | facial | Facials* only | PASS |
| 9 | Ladies Hair Cut price kiyada? | — | pricing_resolver = catalogue price | PASS |
| 10 | mata wedak oni (ambiguous) | None | no full-catalogue dump | PASS |
| 11 | pixie cut thiyenawada? (no SKU) | haircut | empty list | PASS |
| 12 | Duplicate “Normal Facial” in Hair Cut + Facials | haircut | Hair Cut id only | PASS |
| 13 | Singlish / English / SI variants | per table | per intent | PASS |
| 14 | Hair Cut must not list Facial markers | haircut | zero Facials | PASS |

\* Facials and Facials (Ladies and Gents)

Additional intents covered: waxing, eyebrow, cleanup, straightening, hair colour.

---

## 4. Cross-suite smoke (no pricing / booking intent regress)

| Suite | Result |
|---|---|
| `test_gemini_price_leakage_guard.py` | PASS (included in 69) |
| `test_flows_intent_lang.py` | PASS (included in 69) |

Pricing resolver remains mandatory; Keratin shoulder Rs 25,000 gate untouched.

---

## 5. Residual risks (staging / WA smoke when approved)

| Risk | Mitigation |
|---|---|
| Gemini ignores MATCHED SERVICES block | Prompt text is explicit; WA smoke after RC3 deploy approval |
| Prior chat topic bias | Latest message drives `detect_service_category` |
| New T28 categories not in `_CATEGORY_DB_MATCH` | Ambiguous → category menu, not invent |

---

## 6. STOP

Regression evidence is local-only. No production deploy from this report.
