# Sir / Madam Language Regression Report — Larvendo T28

**Date:** 2026-11-14  
**Suite:** `ai_engine/tests/test_customer_respect_sir_madam.py`  
**Result:** **PASS** (included in 85 combined with category + pricing guards)

---

## 1. Case matrix

| # | Scenario | Result |
|---|---|---|
| 1 | Sinhala customer message → Sir/Madam form | PASS |
| 2 | Singlish customer message → Sir/Madam form | PASS |
| 3 | English customer message → Sir/Madam form | PASS |
| 4 | Explicit prefers Sir | PASS |
| 5 | Explicit prefers Madam | PASS |
| 6 | Unknown preference → Sir/Madam | PASS |
| 7 | Customer corrects Sir → Madam | PASS |
| 8 | Human handoff respectful copy | PASS |
| 9 | Booking-style sticky preference over turns | PASS |
| 10 | Pricing-style message still gets honorific | PASS |
| 11 | Complaint / frustration message → respectful form | PASS |
| 12 | Repeated short messages keep stored Madam | PASS |

Additional:

| Check | Result |
|---|---|
| Banned slang detected (Aniwa, Machan, Ow ow, Hari hari, Bro, …) | PASS |
| Slang stripped + Sir ensured | PASS |
| No name-based gender inference | PASS |
| Existing honorific not double-injected | PASS |
| Category filter suite still green | PASS |
| Pricing leakage suite still green | PASS |

---

## 2. Acceptance

| Criterion | Status |
|---|---|
| No casual slang in finalized replies | ✅ |
| Appropriate Sir/Madam / Sir/Madam | ✅ |
| No incorrect gender assumptions | ✅ |
| No robotic double honorific in openers | ✅ |
| Pricing / booking / handoff logic unchanged | ✅ |

---

## 3. STOP

Local evidence only. No production WhatsApp smoke from this report.
