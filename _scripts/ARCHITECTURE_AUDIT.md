# ARCHITECTURE_AUDIT.md — Salon Larvendo AI (Tenant 28)

**Status:** Phase 1 audit complete — **read-only**  
**Date:** 2026-11-14  
**Sources:** codebase inspection + `_scripts/QA_LARVENDO_T28_REPORT.md` + `_scripts/_qa_larvendo_probe.json` + `_scripts/_qa_behaviour_local.json`

---

## 1. System overview

Larvendo WhatsApp AI is a **multi-tenant Hexaone CRM stack**, not a greenfield bot.

```
WhatsApp (Baileys / Cloud)
    → backend inbound (webhook / whatsappWebService)
    → BullMQ (WA_INBOUND_AI) + per-phone Redis turn lock
    → crmInboundTurnService.processInboundAiTurn
        → knowledge search + AI rules + memory + credits gate
        → ai_engine POST /v1/turns  (X-Service-Key + X-Tenant-Id)
            → booking_flow SM (book / cancel / reschedule) OR Gemini chat
            → salon tools via crm-integration APIs
        → outbound send + CRM message log + optional handoff
    → reminders / automations (crmReminderService, CrmAutomation)
```

**Key services**
| Layer | Path | Role |
|---|---|---|
| Inbound orchestration | `backend/services/crmInboundTurnService.js` | Always-reply, handoff ack, opt-out, credits, KB hints, rules, memory |
| Queue workers | `backend/workers/aiCrmWorker.js` | Turn lock, retries, DLQ, reminder jobs |
| AI engine | `ai_engine/app/main.py` | Turn endpoint, prompts, FAQ pause, Gemini |
| Booking SM | `ai_engine/app/booking_flow.py` | Deterministic book/cancel/reschedule |
| Salon tools | `ai_engine/app/tools/*` → `backend/controllers/crmIntegrationController.js` | Tenant-scoped CRUD |
| Provider | `ai_engine/app/provider/gemini_provider.py` | Gemini + optional Google Search |
| WhatsApp send | `crmOutboundSendService` + Cloud/Baileys | Templates + text |
| Reminders | `crmReminderService.js` | Day-before, abandoned, chat abandon |
| Automations catalog | `crmAutomationCatalog.js` | Reminder / birthday / review / rebooking (many disabled by default) |
| Analytics (partial) | `crmAnalyticsController.js` | Usage/cost/wallet — not full V2 quality dashboard |

---

## 2. Tenant isolation & safety (current)

**Strengths**
- Every CRM integration call requires service auth + `X-Tenant-Id` / `crmTenantId`.
- Appointments/services/staff/KB/rules queries filter `tenant_id`.
- Inbound turn resolves `Tenant.findByPk(tenantId)` before work.
- Redis keys namespaced with tenant (`cacheKey(tenantId, …)`).
- Booking idempotency keys include tenant + phone/service/slot.
- Prompt rules: “This salon only”; tool salon data scoped to request tenant.

**Gaps / risks**
- Staff auto-train / listStaff only see `is_active=true` (correct) but KB can still contain stale inactive names.
- Google auto-train articles can inject inaccurate durations into KB search.
- Analytics dashboard incomplete for conversion / wrong-price / CSAT.
- Cross-tenant tests exist partially; V2 requires explicit isolation suite (≥100 conversation tests include isolation cases).

---

## 3. Conversation engine (current capability)

### What already works
- Language/script detection: Sinhala Unicode / Singlish Latin / English (`detect_lang`, `detect_script_mode`, sticky mode).
- Human-like system prompt + 17 tenant AI rules (priority-ordered).
- Customer memory (`crmAiMemoryService`) + recent messages into Gemini.
- Side-ask pause: mid-booking FAQ → Gemini without losing SM state.
- Always-reply fallbacks in inbound + booking empty-text guards.
- Handoff detection (`handoff.py` + complaint regex + rules).
- Image support (hair length estimate rule exists in AI rules).

### Gaps vs V2 “human receptionist”
| Requirement | Current | Gap |
|---|---|---|
| Natural Singlish/SI | Good intent + templates (`sg`) | LLM still sometimes generic when SM exits wrong |
| One question at a time | Booking SM yes; free chat weaker | Need sales-state guardrails |
| Avoid repetition | Memory helps | No explicit anti-repeat scorer |
| Recommendation engine | Category filter + Gemini | No dedicated recommend tool / benefit copy from verified data only |
| Pricing precedence | Rules + live services + KB | Conflicts (Google articles, dup services) not resolved programmatically |

---

## 4. Pricing architecture (current)

**Sources (priority intended by rules)**
1. Live `Service` catalogue via tools / salon data block  
2. Official KB price list article `#29` (priority 110) + category sheets  
3. Other KB / Google auto-train (lower priority)  
4. Google Search — general tips only (rule #17)

**Critical defects (from QA)**
- Duplicate services with conflicting durations (Front Area 90 vs 180).
- Google KB `#27/#28` quote Ladies Hair Cut **75 min** vs official **45 min**.
- Length-based pricing relies on LLM obedience to rule #16 — no hard validator that refuses a price without length.

**V2 need:** a pricing resolver module that:
- Maps ask → service ID(s)
- Applies length tiers from official list
- Blocks invent / blocks conflict → handoff or “salon confirm”

---

## 5. Booking / cancel / reschedule (current)

### Booking SM (`booking_flow.py`)
States: IDLE → SERVICE → (staff auto-assign) → DATE → TIME → NAME → CONFIRM → book tool.

**Important product conflict**
- Live prompt/tool layer: **never show stylist names** (privacy / salon assigns).
- V2 master prompt asks for **optional preferred stylist**.
- Plan must choose: keep silent assign **or** opt-in stylist pick behind tenant setting (recommended).

### Cancel / reschedule
- Singlish cancel intents fixed; mid-book interrupt → cancel.
- `customer_lookup` + `list_appointments` by WhatsApp phone.
- Explicit yes required before cancel/reschedule API.

### Gaps
- Preferred stylist optional not implemented (by design currently).
- Outside working-hours messaging depends on availability slots only.
- Booking reference messaging uneven across languages.
- Multi-appointment pick UX OK; needs more Singlish natural phrases in tests.

---

## 6. Staff & availability (current)

| Fact | Value |
|---|---|
| Branch | Larvendo Kandy `#30` |
| Staff rows | 7 (all `tenant_id=28`) |
| Active bookable | **1** — Nadeeka Gamage `#48` |
| Working hours | Present on all 7 |
| AI listStaff | `is_active=true` only |
| KB staff article | Stale (lists inactive) |

**Do not auto-reactivate.** Management approval required per QA.

Availability: `check_availability` + `staffAvailability` utils; booking duration from service.

---

## 7. Knowledge Base & rules (tenant 28)

| Asset | Count | Notes |
|---|---:|---|
| KB articles | 32 active | service-heavy; 2 malformed Google titles |
| AI rules | 17 active | Strong behaviour/pricing/handoff |
| Live services | 134 | 7 exact-dup groups |
| Auto-train-like KB | 6 | Including stale staff + Google |

**Manual verified content at risk** if aggressive auto-train overwrites — V2 must protect high-priority curated articles (`#29` etc.).

---

## 8. Sales & WhatsApp automation (current)

**Exists**
- Day-before appointment reminders (`runDayBeforeReminders`)
- Abandoned booking nudges + chat-abandoned 2h nudge
- Booking confirm path in reminder service
- Automation catalog: welcome, birthday, review, rebooking, promo (mostly **disabled** defaults)
- Marketing opt-out (`STOP`)

**Missing / incomplete vs V2**
- Reliable **2-hour** reminder execution path (catalog option exists; confirm runner coverage)
- Post-service feedback as first-class enabled flow
- Birthday / reactivation only with consent flags
- Conversion funnel analytics (enquiry → book)
- Soft cross-sell policy engine (verified add-ons only)

---

## 9. Human handoff (current)

Triggers: human request, complaint regex, payment dispute rules, AI `[HANDOFF:…]`, credit exhaustion paths.  
Ack messages Singlish/EN. Conversation stays in CRM for staff.

**Gaps:** structured staff summary packet; pricing-uncertain forced handoff; API-fail handoff consistency.

---

## 10. Analytics / monitoring (current)

`crmAnalyticsController`: AI usage tokens/cost/wallet, some conversation aggregates.  

**Missing for V2 dashboard:** conversion rate, cancel/reschedule counts, top services/FAQs, wrong-price flags, quality score, CSAT.

---

## 11. Test posture (current)

| Suite | Result |
|---|---|
| Behaviour harness | 17/17 |
| pytest flows | 52/55 (3 assertion drift) |
| 100-conversation V2 suite | **Not built** |
| Live WhatsApp smoke | Not in last QA pass |

---

## 12. Architecture verdict

| Area | Grade | Notes |
|---|---|---|
| Multi-tenant plumbing | A- | Solid isolation primitives |
| Booking SM | B+ | Works; stylist UX conflict; staff bottleneck |
| Conversation quality | B | Good rules; pricing conflicts hurt trust |
| Pricing correctness | C+ | Data conflicts + soft LLM enforcement |
| Automations | B- | Core reminders exist; many features off |
| Observability | C | Usage yes; quality/conversion no |
| QA depth | C+ | Need 100-case suite |

**Conclusion:** Evolve in place. Highest ROI is **data integrity + pricing resolver + staff/KB sync + 100-test harness**, then sales/automation polish, then dashboard — not a rewrite.

---

## 13. Non-negotiables carried into V2 plan

1. No auto staff reactivation.  
2. No hard deletes of services/appointments.  
3. No deploy/commit without approval.  
4. Tenant 28 only for data mutations when approved.  
5. Accuracy > feature count.  
6. Stop for review after each phase’s risky ops.
