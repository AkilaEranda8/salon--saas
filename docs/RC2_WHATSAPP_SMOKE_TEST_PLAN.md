# RC2 — Authorized Tenant 28 WhatsApp Smoke Plan

**Status:** PREPARED — **DO NOT SEND** until explicit authorization  
**Bundle:** `_release/phase4c_t28_rc2/`  
**Tenant:** 28 — Salon Larvendo Pvt LTD  
**Channel:** Authorized **test number only**  

## Preconditions

- [ ] Explicit written authorization to send WhatsApp to the test number  
- [ ] RC2 deployed per `DEPLOY_ORDER.txt` (or staging WA bridge with RC2 code)  
- [ ] Pre-deploy prod snapshot complete (`docs/PHASE4_ROLLBACK_PLAN.md`)  
- [ ] Test phone: `________________`  
- [ ] Observer: action logs + DB appointment access  
- [ ] Staging Gemini key rotated; prod uses authorized secret store only  

## Stop immediately if

- Any customer-facing price ≠ verified resolver (esp. Keratin shoulder ≠ **25000**, Galaxy quotes a number, Butterfly ≠ **4500**)  
- Booking/cancel success without DB proof  
- Cross-tenant data or replies  

## Checklist

### A. Languages & ingress

| # | Send | Expect | ☐ |
|---|---|---|---|
| A1 | `Hi` | Welcome; single reply | |
| A2 | `Keratin kiyada?` | Length ask; **pricing_resolver** | |
| A3 | `Shoulder` (after A2) | **Rs 25,000** (not 15,000) | |
| A4 | `කෙරටින් shoulder මිල` | Verified **25000** path | |
| A5 | `Keratin shoulder mila` | Verified **25000** | |
| A6 | `How much is a hydra facial?` | Verified facial / list | |

### B. Pricing safety

| # | Send | Expect | ☐ |
|---|---|---|---|
| B1 | `Galaxy Plasma Treatment price kiyada?` | Clarify/staff — **no** Keratin/tier invent | |
| B2 | `Ladies Hair Cut-Butterfly price` | **Rs 4,500** (id 278), not 3500 | |
| B3 | After Keratin context: `Bra Strap` | **Rs 30,000** | |
| B4 | `Is keratin shoulder Rs 15000?` | Correct to **25000** or staff — never affirm 15k | |
| B5 | `Any discount on keratin?` | No invented discount amount | |

### C. Topic switch / pause / image

| # | Send | Expect | ☐ |
|---|---|---|---|
| C1 | Start book → await date | Date prompt | |
| C2 | Mid-date: `Facial mila?` | Price; booking **paused** | |
| C3 | `continue` | Resume; draft preserved | |
| C4 | Photo mid await_date | Image/vision reply; not “send a date” | |
| C5 | Correction: wrong service reply then customer corrects | Apologize; answer latest ask | |

### D. Booking / cancel / handoff

| # | Send | Expect | ☐ |
|---|---|---|---|
| D1 | Complete book (test slot) | Success **only** if DB row created | |
| D2 | `cancel my appointment` → confirm | Success **only** if DB cancelled | |
| D3 | `I want to speak to staff` | Human handoff | |
| D4 | Observer: other tenant unchanged | No leakage | |
| D5 | Rapid double-send same book/confirm text | No duplicate divergent bookings / double confirm | |

## Sign-off

| Role | Name | Date | Result |
|---|---|---|---|
| Tester | | | PASS / FAIL |
| Reviewer | | | |

**Authorization to send:** ________________  
**Deploy approval id:** ________________  
