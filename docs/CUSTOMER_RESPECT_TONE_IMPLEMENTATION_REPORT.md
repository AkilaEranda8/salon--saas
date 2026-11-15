# Customer Respect Tone Implementation Report — Larvendo T28

**Date:** 2026-11-14  
**Tenant:** 28 – Salon Larvendo  
**Scope:** Mandatory Sir / Madam addressing + ban casual slang  
**Environment:** Local / staging only  
**Release candidate:** `phase4c_t28_rc4`  
**Production:** **unchanged** (no deploy · no restart · no WhatsApp · no customer data edits)

> Note: Production already runs **RC3** (category filtering). This work is packaged as **RC4** so RC2/RC3 bundles stay immutable. The brief’s “RC3 candidate” naming maps to **RC4** here.

---

## 1. Summary

| Requirement | Status |
|---|---|
| Sir / Madam on every customer-facing reply | ✅ prompt + soft enforce |
| No casual slang (Aniwa, Machan, Bro, …) | ✅ detect + strip |
| No gender inference from name/photo | ✅ |
| Persist preference on explicit confirm/correction | ✅ memory meta |
| Unknown → Sir/Madam (+ ask once allowed) | ✅ |
| Language match (SI / Singlish / EN) | ✅ |
| Pricing / booking / handoff behaviour preserved | ✅ |
| Local only / STOP for review | ✅ |

---

## 2. Design

| Layer | Behaviour |
|---|---|
| `customer_respect.py` | Detect preference, resolve form, system prompt block, ensure honorific, ban slang |
| `main.py` | Resolve form each turn; inject respect system block; `_finalize_customer_reply` on all outbound paths |
| `crmAiMemoryService.js` | Persist `address_preference` / `honorific` / `address_form` / `address_preference_asked` in meta |

Preference sources (only):

- Explicit “call me Sir/Madam”, “I am a gentleman/lady”, Singlish/Sinhala equivalents  
- Explicit correction (“sir nemei, madam kiyanna”)  
- Stored memory from prior confirm  

**Never** used: customer name, profile photo, appearance.

---

## 3. Files changed (local)

| File | Change |
|---|---|
| `ai_engine/app/customer_respect.py` | **New** module |
| `ai_engine/app/main.py` | Respect prompt + finalize on booking / pricing / Gemini / soft fallbacks |
| `backend/services/crmAiMemoryService.js` | Memory load/upsert for honorific |
| `ai_engine/tests/test_customer_respect_sir_madam.py` | **New** regression suite |

---

## 4. Tests

```text
pytest tests/test_customer_respect_sir_madam.py \
       tests/test_customer_intent_category_filtering.py \
       tests/test_gemini_price_leakage_guard.py
→ 85 passed
```

---

## 5. Execution restrictions (honoured)

- No production deploy / restart  
- No WhatsApp messages  
- No customer or booking data modification  
- RC2 / RC3 release folders not overwritten  
- RC4 candidate prepared under `_release/phase4c_t28_rc4/`

---

## 6. STOP

Ready for review. **Do not deploy** without a separate explicit approval message.
