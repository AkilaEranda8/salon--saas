# Customer Intent Category Filtering Report — Larvendo T28

**Date:** 2026-11-14  
**Tenant:** 28 – Salon Larvendo Pvt LTD  
**Environment:** Local / staging implementation only  
**RC candidate:** `phase4c_t28_rc3`  
**Production RC2:** unchanged (no deploy · no restart · no WhatsApp · no data changes)

---

## 1. Summary

Reproduced and fixed a catalogue-mixing failure where Hair Cut Singlish asks (e.g. “Mata hair cut ekak kara ganna oni”) could drive Gemini with an unfiltered / Facials-biased catalogue. RC3 gates both the Gemini `services_block` and the salon live snapshot on **customer category intent** resolved against **Tenant 28 live DB categories**.

| Requirement | Status |
|---|---|
| Intent → category before catalogue retrieve | ✅ |
| Hair Cut returns only Hair Cut | ✅ |
| Zero Facials on Hair Cut asks | ✅ |
| Sinhala / Singlish / English | ✅ |
| No invented services / prices | ✅ (catalogue + pricing resolver unchanged) |
| Latest message intent wins (switch category) | ✅ |
| Local only / RC3 candidate / STOP for review | ✅ |

---

## 2. Root cause

1. **`service_ask` missed Hair Cut messages**  
   Phrases like “Mata hair cut ekak kara ganna oni” did not match the generic services regex, so the structured category `services_block` was **never built**.

2. **Salon snapshot used loose token matching**  
   Tokens such as `hair` matched Hair Treatment / Grey Hair Cover / etc. When matching failed, fallback was `services[:40]`, which in the T28 fixture order is **Dressing + Facials heavy** (includes Aroma Magic Gold Facial, Clean-up, Fox C Peel, Gold/Diamond Facial, Hydra Facial, Normal Facial — matching the reported bad reply).

3. **Treatment name regex leaked Facials**  
   `_filter_services_by_message` matched `treatment` inside service **names**, so “Keratin” / treatment asks could include “Fox C Peel Treatment” under Facials.

Booking-flow Hair Cut filtering already worked in isolation; the Gemini prompt path did not use it for these messages.

---

## 3. Live T28 category structure (fixture-verified)

Used as the only category source (no invented categories):

| Live DB category | Intent keys |
|---|---|
| Hair Cut | `haircut` |
| Facials / Facials (Ladies and Gents) | `facial`, `cleanup` |
| Hair Treatment | `treatment`, `keratin`, `straightening` |
| Fashion Colours / Grey Hair Cover | `color` |
| Dressing / Hair Setting | `dressing` |
| Wedding Arrangement | `bridal` |
| Waxing | `waxing` |
| Threading | `threading`, `eyebrow` |
| Nails / Manicure & Pedicure / Manicure and Pedicure | `nails` |

---

## 4. Fix (local)

| File | Change |
|---|---|
| `ai_engine/app/booking_flow.py` | Expanded category intents; `_CATEGORY_DB_MATCH` strict DB boundary; `resolve_catalogue_for_message()`; stop-token ignore; keratin / cleanup / straightening / eyebrow refine |
| `ai_engine/app/main.py` | Category intent forces `service_ask`; both `services_block` and salon snapshot call `resolve_catalogue_for_message`; removed Facials-biased `services[:40]` fallback |
| `ai_engine/tests/test_customer_intent_category_filtering.py` | New regression suite (33 tests) |

**Unchanged / preserved:** `pricing_resolver.py` (mandatory), RC2 backend/worker, booking confirm behaviour, tenant isolation.

---

## 5. Before → After (bug phrase)

**Customer:** `Mata hair cut ekak kara ganna oni`

| | Before | After (local) |
|---|---|---|
| Detected intent | `haircut` (unused by Gemini path) | `haircut` (enforced) |
| Catalogue to model | Loose `hair` matches or `services[:40]` Facials | **10 × Hair Cut only** |
| Sample rows | Aroma Magic Gold Facial, Clean-up, … | Baby / Gents / Ladies Hair Cut, … |
| Facial markers | Present | **Absent** |

---

## 6. Tests

```text
pytest tests/test_customer_intent_category_filtering.py  → 33 passed
pytest tests/test_gemini_price_leakage_guard.py tests/test_flows_intent_lang.py → 69 passed
```

Coverage includes the 14 acceptance scenarios from the brief (haircut variants, facial, keratin, colour, layer cut, switch, price via resolver, ambiguous, no-match, duplicate names, multilingual, zero Facials on Hair Cut).

---

## 7. Execution restrictions (honoured)

- Local / staging implementation and tests only  
- Production code not restarted / not overwritten  
- No WhatsApp sends  
- No customer or booking data changes  
- RC2 preserved immutable under `_release/phase4c_t28_rc2`  
- RC3 prepared separately — **deploy requires separate explicit approval**

---

## 8. STOP

Ready for review. Do **not** deploy RC3 without a separate approval message.
