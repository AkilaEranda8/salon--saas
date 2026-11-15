# Salon Larvendo – Production AI QA Report

**Tenant:** `#28` Salon Larvendo Pvt LTD (`salon-larvendo`)  
**Scope:** Read-only investigation + proposed cleanup (no deploy, no deletes, no rule changes)  
**Date:** 2026-11-14  
**Evidence:** `_scripts/_qa_larvendo_probe.json`, `_scripts/_qa_behaviour_local.json`, `ai_engine` pytest

---

## 1) QA Test Report

### Automated tests (local `ai_engine`)

| Suite | Result | Notes |
|---|---|---|
| Behaviour intent/script/handoff harness | **17/17 PASS (100%)** | Price / book / cancel / reschedule / Singlish / SI / EN / mid-book cancel / handoff |
| `pytest tests/` (flows + intent) | **52/55 PASS (94.5%)** | 3 failures = **stale assertions**, not production logic bugs |

**Failing tests (assertion drift only):**
1. `test_reschedule_end_to_end` — expects `"Available times"`, actual `"Available on …"`
2. `test_reschedule_conflict_409_reasks_date` — same string drift
3. `test_tamil_prompts_and_date` — expects Tamil prompt; current path returns English service-category clarifier

### Behaviour coverage matrix

| Scenario | EN | Singlish | SI | Result |
|---|---|---|---|---|
| Price enquiry | chat+faq | chat+faq | chat+faq | PASS |
| Hair-length pricing intent (keratin mila) | — | chat+faq | — | PASS (length rule exists in AI rules; live LLM not called in unit harness) |
| Booking | book | book | book | PASS |
| Reschedule | reschedule | reschedule | — | PASS |
| Cancel + identify path | cancel | cancel | — | PASS (customer_lookup wired; unit intent OK) |
| Mid-book cancel interrupt | — | cancel | — | PASS |
| Cancel membership (must NOT cancel appt) | chat | — | — | PASS |
| Discount ask | chat | — | — | PASS (rule: never invent discounts) |
| Complaint / human handoff | wants_human=true | — | — | PASS |
| Unknown / Google fallback | — | — | — | Covered by rule #17 (not live-probed this run) |

### Production safety this run
- No other tenants touched  
- No deletes  
- No AI rule changes  
- No deploy / commit  

---

## 2) Staff Data Integrity Report

### Root cause of “staff count = 0” (previous training report)

**False negative in the reporting script**, not an empty table.

| Issue | Detail |
|---|---|
| Wrong attribute | Probe used `attributes: ['id','name','status','branch_id']` |
| Actual model fields | `Staff.is_active` (boolean), **no `status` column** |
| Effect | Sequelize error was swallowed → `staff = []` → reported 0 |

**Model (confirmed):** `backend/models/Staff.js`  
- `tenant_id`, `branch_id`, `is_active`, `available_online`, `working_hours` (JSON)

### Actual production staff (tenant 28 / branch 30 Larvendo Kandy)

| ID | Name | Role | is_active | available_online | working_hours |
|---:|---|---|---|---|---|
| 48 | Nadeeka Gamage | Stylist | **true** | true | yes (09:00–18:00 pattern) |
| 40 | Hiruni Navodya | Salon Manager | false | true | yes |
| 42 | Nethu Thisaramani | Junior Stylist | false | true | yes |
| 43 | Kavishi Nimsara | Trainee | false | false | yes |
| 47 | Chathurani Umayangani | Trainee | false | false | yes |
| 50 | Anuradha Abeysinghe | Senior Stylist | false | false | yes |
| 51 | Jayan Pradeep | Junior Stylist | false | false | yes |

**Counts:** 7 total · **1 active** · 0 missing `tenant_id` · 0 missing `working_hours`

### AI sync impact (real issue)

| Path | Filter | Effect |
|---|---|---|
| `listStaff` CRM tool | `tenant_id` + `is_active: true` | AI booking/availability sees **only Nadeeka** |
| `autoTrainFromSalon.buildStaffArticle` | same | Should sync only active; KB article still lists inactive names → **stale KB** |
| KB article `#24` “Auto-train: Staff & hours” | body still includes Anuradha, Chathurani, … | Out of sync with live active roster |

### Proposed fix (approval required — not applied)

1. **Confirm with salon** which of the 6 inactive stylists should be `is_active=true` for WhatsApp booking.  
2. If they should book: set `is_active=true` (and `available_online` as needed) for approved IDs only.  
3. Re-run salon auto-train for tenant 28 to refresh KB staff article.  
4. Optionally harden `autoTrainFromSalon` / `listStaff` to also include `available_online` staff when `is_active` is false **only if product wants that** (not recommended without product decision).  
5. Fix reporting scripts to use `is_active` (local script fix only until approved).

---

## 3) Duplicate Service Report (proposal only — no merges/deletes)

**Total services:** 134 active in prior catalogue dump · **7 exact-duplicate name groups** (normalized)

### Exact duplicates (same normalized name)

| Keep (proposed) | Deactivate (proposed) | Name / notes | Appt refs | Risk |
|---:|---:|---|---|---|
| **202** | 306 | Full Dressing (Day Time) vs Full Dressing Day Time · Rs4000/120 | 202→2, 306→0 | Low if soft-deactivate 306 |
| **318** *(prefer online)* | 172 | Booster Pack+ vs Booster Pack + · Rs2000/30 | 0/0 | Prefer `#318` (`available_online=true`); algorithm initially favored lowest id — **override** |
| **319** *(prefer online)* | 228 | High-frequency vs High Frequency · Rs1500/15 | 0/0 | Prefer `#319` online |
| **225** | 302 | Hand Wax (Full) vs Hand Wax Full · Rs3000/30 | 0/0 | Safe soft-deactivate |
| **240** | 304 | Leg Wax (Full) vs Leg Wax Full · Rs3500/45 | 0/0 | Safe soft-deactivate |
| **259** | 289 | Root Cover (Full Hair) vs Root Cover Full Hair · Rs4500/90 | 0/0 | Safe soft-deactivate |
| **needs decision** | — | Front Area (Relax/Rebonding) `#196` **90m** vs `#291` **180m** · both Rs7000 | 0/0 | **Duration conflict** vs official list (**180m**) → prefer keep `#291`, deactivate `#196` **or** update `#196` duration |

**Action policy (recommended):** `is_active=false` on duplicates — **never hard-delete** until Appointment/AppointmentService refs rechecked.

### Near-duplicates (legitimate variations — do NOT merge)

Examples: Ladies Hair Cut vs Butterfly · Foot Massage 30 vs 60 · Normal Facial Oxy vs Jovis · Hair Spa vs Spa with BF · Gents Grey Cover vs Beard · Hydra Standard vs Ume Care.

These are **real menu variants**.

### Category naming hygiene
- `Manicure & Pedicure` vs `Manicure and Pedicure`
- `Facials` vs `Facials (Ladies and Gents)`  
→ optional normalize later; not blocking.

---

## 4) Knowledge Base Cleanup Report

### Malformed Google auto-train titles (2) — content OK, titles broken

| ID | Priority | Current title (broken) | Proposed title (preserve priority/body) |
|---:|---:|---|---|
| 27 | 72 | `Auto-train (Google): haircut එකක කරගන න ක යක යනවද` | `Auto-train (Google): Haircut එකක් කරගන්න කීයක් යනවද?` |
| 28 | 72 | long spaced Sinhala garbage | `Auto-train (Google): Hi — services & haircut prices?` |

**Not applied** (awaiting approval). Body + priority would remain unchanged.

### Pricing conflict / staleness findings

| Finding | Severity | Detail |
|---|---|---|
| Official list vs Google auto-train bodies | **Medium** | Articles 27/28 quote **Ladies Hair Cut — 75 min · LKR 3500**; official list = **45 min / 3500**. Price OK, duration wrong. |
| Catalogue duplicates with duration clash | **Medium** | Front Area Relax `#196` 90m vs official/list `#291` 180m |
| Staff KB `#24` stale | **Medium** | Lists inactive staff; live tool returns 1 active |
| Auto-train services dump `#23` | **Low–Med** | Large live dump can diverge from curated official list `#29` (p=110 wins in search if priorities respected) |
| Opening hours KB | **Low** | Generic Mon–Sat; branch phone `0812235955`, address Kandy — OK but not clock-precise |

### Proposed KB actions (approval required)
1. Rename articles 27 & 28 titles only.  
2. Either refresh 27/28 bodies from official list **or** deactivate them so curated sheets win.  
3. Re-run salon auto-train after staff activation decision.  
4. Do **not** change AI rules without separate approval.

---

## 5) AI Response Quality Score

| Dimension | Score | Evidence |
|---|---:|---|
| Intent routing (book/cancel/reschedule/FAQ) | **95** | 17/17 local cases; Singlish cancel fixed |
| Language/script auto-detect | **92** | EN/SI/Singlish PASS; sticky yes/ok PASS |
| Pricing truthfulness (rules + KB) | **78** | Strong rules; duration conflicts in Google articles + Front Area |
| Booking / reschedule flow | **88** | Logic OK; 2 pytest assertion drifts |
| Cancel + customer identify | **90** | Intent + `customer_lookup` wired; live WA smoke not re-run this pass |
| Handoff / complaints | **93** | `wants_human` true on manager/human/refund/billing |
| Staff availability answers | **55** | Only 1 active staff in tools; KB roster stale |
| Catalogue cleanliness | **70** | 7 dup groups + near-dup noise in lists |
| **Overall AI quality** | **83 / 100** | Good conversational routing; data integrity gaps hold score down |

---

## 6) Remaining Production Risks

1. **6/7 stylists inactive** → WhatsApp booking auto-assigns from a single stylist → bottleneck / wrong availability.  
2. **Stale staff KB** vs live `listStaff` mismatch → AI may name inactive people.  
3. **Google auto-train articles** with wrong durations can still surface in search.  
4. **Duplicate services** inflate “matching services” dumps for customers.  
5. **Front Area duration conflict** (90 vs 180) can mis-book slot length.  
6. **No live end-to-end WhatsApp smoke** in this QA pass (unit + DB only).  
7. Pytest assertion drift may hide real regressions if not updated.

---

## Approval checklist (next actions — not done)

- [ ] Confirm which staff IDs to reactivate  
- [ ] Approve soft-deactivate list for duplicate services  
- [ ] Approve KB title renames for #27 / #28 (+ optional deactivate)  
- [ ] Approve Front Area keep `#291` / fix `#196` duration  
- [ ] Approve re-run of salon auto-train for tenant 28 only  
- [ ] Approve deploy of any code/report-script fixes  
- [ ] Optional: update stale pytest assertions  

---

## Evidence files
- `_scripts/_qa_larvendo_probe.json` — production probe  
- `_scripts/_qa_behaviour_local.json` — behaviour harness  
- `_scripts/QA_LARVENDO_T28_REPORT.md` — this report  
