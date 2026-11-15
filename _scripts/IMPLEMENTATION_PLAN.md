# IMPLEMENTATION_PLAN.md — Larvendo AI V2

**Tenant:** 28 (Salon Larvendo Pvt LTD)  
**Mode:** Improve existing system — no rewrite  
**Gate:** No production mutations / deploy / commit until explicit approval per phase  
**Audit basis:** `_scripts/ARCHITECTURE_AUDIT.md` + `_scripts/QA_LARVENDO_T28_REPORT.md`

---

## Guiding principles

1. **Accuracy & booking correctness > new features**  
2. **Live verified services > official price list KB > other KB > Google tips**  
3. **Conflicts → ask / escalate — never guess**  
4. **One WhatsApp question at a time**  
5. **Tenant isolation always validated**  
6. **Soft-deactivate duplicates; never hard-delete without refs check**  
7. **Staff reactivation is a human decision only**

---

## Decision needed before Phase 3 booking UX

| Topic | Current production | V2 master prompt | Recommendation |
|---|---|---|---|
| Stylist selection | Hidden; auto-assign active staff | Optional preferred stylist | Add tenant setting `allow_stylist_preference` (default **false** for Larvendo until salon approves) |

---

## Phase 1 — Architecture audit & data integrity

**Goal:** Fix false reporting, prepare safe data cleanup proposals, protect curated KB.

### 1A — Already done (this gate)
- [x] Architecture audit document  
- [x] QA probe (staff/services/KB)  
- [x] Behaviour harness baseline (17/17)  
- [x] This implementation plan  

### 1B — Local-only code (no deploy until approved)
| Task | Outcome |
|---|---|
| Fix report scripts (`status` → `is_active`) | Correct staff counts forever |
| Add `pricing_resolver` skeleton (unit-tested, unused in prod until Phase 2) | Hard rules for length / conflict |
| Draft KB title rename SQL/script for `#27/#28` | Ready to run on approval |
| Draft soft-deactivate service ID list | Ready to run on approval |
| Draft staff KB refresh (active-only) | After management staff decision |

### 1C — Production data ops (**STOP — needs approval**)
| Op | IDs / action | Risk |
|---|---|---|
| Rename KB titles | `#27`, `#28` only | Low |
| Soft-deactivate service dupes | `306,172,228,302,304,289,196` (keep `202,318,319,225,240,259,291`) | Medium — verify refs again at apply time |
| Staff reactivation | **None unless salon lists IDs** | High |
| Refresh auto-train staff article | Tenant 28 only | Low–Med |
| Deactivate or rewrite Google bodies with wrong duration | `#27/#28` | Med |

### Phase 1 exit criteria
- Audit + plan reviewed  
- Approved cleanup checklist signed off  
- No deploy yet required for 1B local work  

### Phase 1 deliverables
- `ARCHITECTURE_AUDIT.md` ✅  
- `IMPLEMENTATION_PLAN.md` ✅  
- Updated QA appendix after approved data ops (later)

---

## Phase 2 — AI intelligence & pricing accuracy

**Depends on:** Phase 1 data approvals (at least KB title fix + duration conflict decision)

### Work items
1. **Pricing engine** (`ai_engine` + optional backend helper)
   - Resolve service from message + catalogue  
   - Length gate for Keratin/Botox/Rebonding/Fashion colours  
   - Distinguish fixed vs `Up` / ranges  
   - Precedence: live service row → official list sheet → refuse if conflict  
2. **Recommendation engine**
   - Intent → candidate services from **live catalogue only**  
   - Benefit copy only from KB/service description (no medical claims)  
   - Soft cross-sell: 0–1 add-on when appropriate  
3. **Conversation polish**
   - Strengthen Singlish/SI short replies  
   - Anti-generic fallback (replace “Got it! How can I help…”) with context-aware always-reply  
   - Prompt injection defenses (already partial — harden)  
4. **KB policy**
   - Curated high-priority articles protected from auto-train overwrite  
   - Google auto-train cannot lower-quality-overwrite `#29`

### Tests
- Pricing unit tests (100% of fixture catalogue cases)  
- Length-required cases must ask length before quoting  
- Conflict → handoff / confirm path  

### Deliverable
- `PRICING_ACCURACY_REPORT.md`  
- Partial `AI_V2_IMPLEMENTATION_REPORT.md`  

### Stop for review before enabling pricing resolver in production.

---

## Phase 3 — Smart booking & availability

### Work items
1. Booking SM polish: clearer confirmation + booking reference after API success only  
2. Outside working hours / no-slot alternatives (already partial — harden copy)  
3. Cancel/reschedule Singlish expansion + multi-appt UX  
4. Staff: use **approved active only**; never offer inactive  
5. Optional stylist preference behind tenant flag (default off)  
6. API failure → handoff + no false success  
7. Idempotency audit for book/cancel/reschedule  

### Tests
- Booking correctness 100% on fixtures  
- Unauthorized booking impossible without confirm  
- Unavailable stylist / outside hours cases  

### Deliverable
- `BOOKING_FLOW_QA_REPORT.md`  

### Stop before production deploy of booking changes.

---

## Phase 4 — Sales conversion & WhatsApp automation

### Work items
1. Enquiry→book soft CTA (one CTA max)  
2. Abandoned booking recovery (tune existing runners; consent-aware)  
3. Confirm: booking confirm, cancel confirm, reschedule confirm messages  
4. Reminders: day-before + **2-hour** path verification/enable for T28  
5. Post-service feedback automation (opt-in enable)  
6. Birthday / reactivation **only if** marketing consent + not opted out  
7. Idempotent `CrmFollowUpJob` keys to prevent duplicate WA  

### Deliverable
- `WHATSAPP_AUTOMATION_REPORT.md`  

### Stop before enabling new automations in production.

---

## Phase 5 — Dashboard & analytics

### Work items
1. Extend `crmAnalyticsController` + CRM UI page for:
   - conversations, AI handled, handoffs  
   - enquiries, conversion, bookings, cancel, reschedule  
   - top services / FAQs  
   - wrong-price flags (from eval harness / human marks)  
   - quality score + CSAT (when feedback exists)  
2. Tenant-scoped only  

### Deliverable
- Section in `AI_V2_IMPLEMENTATION_REPORT.md` + UI notes  

---

## Phase 6 — Automated QA & production readiness

### Work items
1. **≥100 conversation tests** (SI / Singlish / EN) covering all master-prompt scenarios  
2. Tenant isolation tests (T28 vs other tenant fixtures)  
3. Duplicate webhook / idempotency tests  
4. API failure injection tests  
5. Fix stale pytest assertions (Available on / Tamil)  
6. Production readiness checklist  

### Targets
| Metric | Target |
|---|---|
| Pricing accuracy | 100% (fixtures) |
| Booking correctness | 100% |
| Language match | ≥95% |
| Handoff correctness | ≥95% |
| Unauthorized bookings | 0 |
| Cross-tenant leakage | 0 |

### Deliverables
- `AI_100_CONVERSATION_TEST_REPORT.md`  
- `TENANT_ISOLATION_REPORT.md`  
- `PRODUCTION_READINESS_REPORT.md`  
- Final `AI_V2_IMPLEMENTATION_REPORT.md`  

---

## Suggested approval sequence (you reply with checkboxes)

Please approve explicitly before each risky step:

```
[ ] A1  Rename KB #27/#28 titles (T28 only)
[ ] A2  Soft-deactivate duplicate services (listed IDs)
[ ] A3  Front Area: keep #291 / deactivate #196 (or fix duration)
[ ] A4  Staff IDs to reactivate: _______________ (or none)
[ ] A5  Refresh salon auto-train KB for T28 (staff/services)
[ ] A6  Deactivate or rewrite Google articles with wrong durations
[ ] B1  Implement Phase 2 pricing resolver locally
[ ] B2  Deploy Phase 2 to production
[ ] C1  Deploy Phase 3 booking changes
[ ] D1  Enable 2h reminder / feedback automations for T28
[ ] E1  Ship analytics dashboard
[ ] F1  Production go-live for V2 package
```

---

## Immediate next step (after your review)

**Default recommendation if you approve a minimal safe pack:**

1. `A1` + `A3` + `A2` (data hygiene)  
2. `A4=none` until salon confirms stylists  
3. `A5` staff KB refresh (active-only)  
4. Start **Phase 2 local** pricing resolver + tests (**no deploy**)

I will **not** mutate production or deploy until you send approvals.

---

## Deliverable map

| # | Document | When |
|---|---|---|
| 1 | `ARCHITECTURE_AUDIT.md` | ✅ Phase 1 |
| 2 | `IMPLEMENTATION_PLAN.md` | ✅ Phase 1 |
| 3 | `AI_V2_IMPLEMENTATION_REPORT.md` | After Phase 2+ |
| 4 | `PRICING_ACCURACY_REPORT.md` | Phase 2 |
| 5 | `BOOKING_FLOW_QA_REPORT.md` | Phase 3 |
| 6 | `WHATSAPP_AUTOMATION_REPORT.md` | Phase 4 |
| 7 | `TENANT_ISOLATION_REPORT.md` | Phase 6 |
| 8 | `AI_100_CONVERSATION_TEST_REPORT.md` | Phase 6 |
| 9 | `PRODUCTION_READINESS_REPORT.md` | Phase 6 |
