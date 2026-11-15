# Phase 4 — WhatsApp Smoke-Test Plan (Tenant 28)

**Status:** PREPARED — **DO NOT SEND** until explicit authorization  
**Target:** Authorized **test number** only (not live customers)  
**Tenant:** 28 — Salon Larvendo  

## Preconditions (before any send)

- [ ] Explicit written authorization to send WA messages to the test number  
- [ ] Deploy package live on prod (or staging WA bridge)  
- [ ] Test phone number recorded: `________________`  
- [ ] Observer has DB/Redis/action-log access for verification  
- [ ] Rollback snapshot taken  

## Session rules

- One conversation thread; clear booking session between scenarios if needed  
- Record: inbound text, AI reply, tools/actions, DB appointment rows  
- Stop on first critical failure (false price, false book/cancel, cross-tenant)  

## Checklist

### A. Ingress & language

| # | Send | Expect | Pass? |
|---|---|---|---|
| A1 | `Hi` | Welcome / help; single reply | ☐ |
| A2 | `Keratin kiyada?` (Singlish) | Length ask (shoulder/bra/hip); **pricing_resolver** | ☐ |
| A3 | `කෙරටින් මිල කීයද` | SI/SG length ask; verified path | ☐ |
| A4 | `How much is a hydra facial?` | Verified facial price/list | ☐ |

### B. Pricing safety

| # | Send | Expect | Pass? |
|---|---|---|---|
| B1 | `Galaxy Plasma Treatment price kiyada?` | Clarify / staff — **NOT Keratin 25000** | ☐ |
| B2 | After A2: `Bra Strap` | Official Keratin bra-strap tier (~30000) via resolver | ☐ |
| B3 | `Ladies Hair Cut-Butterfly price` | **Rs 4500** (id 278), not 3500 | ☐ |
| B4 | `Facial mila?` | Verified list (no wrong single invent) | ☐ |

### C. Memory & latest-ask priority

| # | Send | Expect | Pass? |
|---|---|---|---|
| C1 | Start book → pick service → await date | Date prompt | ☐ |
| C2 | Mid-date: `Facial mila?` | Price answer; booking **paused**; pause action present | ☐ |
| C3 | `continue` | Resume date ask; draft preserved | ☐ |
| C4 | `Ahana deta nemei rply denn` (after a miss) | Correction; **not** generic say-book | ☐ |

### D. Image

| # | Send | Expect | Pass? |
|---|---|---|---|
| D1 | Photo mid await_date | Vision-style reply; **not** “send a date”; pause kept | ☐ |

### E. Booking / cancel (backend confirm only)

| # | Send | Expect | Pass? |
|---|---|---|---|
| E1 | Complete book with test service/date/time | Success **only** if DB appointment created | ☐ |
| E2 | `cancel my appointment` → `yes` | Success **only** if `status=cancelled` in DB | ☐ |
| E3 | Force slot conflict if possible | No false “confirmed” | ☐ |

### F. Handoff & reliability

| # | Send | Expect | Pass? |
|---|---|---|---|
| F1 | `I want to speak to staff` | Handoff / staff path | ☐ |
| F2 | Rapid double-send same text | No duplicate divergent bookings | ☐ |
| F3 | Observer: other tenant unchanged | No cross-tenant bleed | ☐ |

## Sign-off

| Role | Name | Date | Result |
|---|---|---|---|
| Tester | | | PASS / FAIL |
| Reviewer | | | |

**Authorization to send:** ________________ (signature / chat approval id)
