# Phase 6 RC9a — Staging Evaluation Plan

**Candidate under evaluation:** `_release/phase6_t28_rc9a`  
**Parents (immutable — do not overwrite):** `phase6_t28_rc8`, `phase6_t28_rc9`, `phase6_t28_rc9a`  
**Plan status:** PREPARED — evaluation **NOT STARTED**  
**Gate:** Separate written approval required before any staging deploy, Gemini calls, or evaluation runs

---

## 0. Hard safety rules

| Rule | Enforcement |
|------|-------------|
| Staging only | Isolated host / compose stack — **not** production `46.62.135.100` unless a dedicated non-prod target is explicitly named in approval |
| Test tenant only | Dedicated staging tenant ID (recommended: clone of T28 catalogue into **staging tenant**, never write production T28 DB) |
| Synthetic customers | Test phones only (e.g. `+9477STAGING01`…); no production CRM leads/conversations |
| Credentials | Staging Gemini API key + staging DB/Redis only; never log API keys or production secrets |
| No live WhatsApp | Baileys / WA outbound **disabled**; evaluate via HTTP `POST /ai/turn` (or staging CRM inbound with WA send mocked) |
| No production restart/deploy | Staging package install only after approval |
| No commit / push | Out of scope for this evaluation |
| Preserve snapshots | Do not modify `_release/phase6_t28_rc{8,9,9a}` |

**STOP condition:** If any step would touch production customers, production Redis, or send a real WA message — abort and escalate.

---

## 1. Staging environment (to provision after approval)

### 1.1 Stack

| Component | Requirement |
|-----------|-------------|
| App | Backend + AI engine + worker from **RC9a** package (deployable files only) |
| DB | Staging MySQL schema; seed salon catalogue for test tenant |
| Redis | Staging Redis (separate from prod); booking sessions + budget ledger |
| Gemini | Paid/staging project key with billing alerts; models: `gemini-3.1-flash-lite`, `gemini-3.8-flash`, `gemini-4-hydrogen` |
| CRM UI | Optional; primary harness is API + turn action logs |

### 1.2 Feature flags / env (staging)

```
GEMINI_COST_ROUTER=1
GEMINI_MONTHLY_HARD_CAP=20
GEMINI_MONTHLY_PLANNED=16
# Optional for controlled budget tests:
# GEMINI_MONTHLY_HARD_CAP=0.05  (budget exhaustion scenarios only)
REDIS_URL=<staging>
# WhatsApp outbound: disabled / dry-run
```

### 1.3 Evaluation harness

For each turn record a **Turn Evidence Card** (JSONL file, no secrets / no unnecessary PII):

```json
{
  "case_id": "S1-01",
  "turn": 2,
  "lang": "singlish",
  "customer_message": "...",
  "prompt_system_excerpt_sha": "...",
  "model_id": "gemini-3.8-flash",
  "model_reply": "...",
  "actions": ["pricing_resolver", "response_quality", "gemini_cost_router", "..."],
  "backend_truth": {
    "service_id": null,
    "amount_lkr": 25000,
    "booking_ok": false,
    "memory": {"last_service": "keratin", "preferred_date": "..."}
  },
  "validator": {"ok": true, "missing": [], "falsely_claims_booking": false},
  "pass": true,
  "critical_failure": null,
  "notes": ""
}
```

Output path (staging): `docs/eval_runs/rc9a_staging_<UTC_DATE>/turns.jsonl`  
Summary: `.../SUMMARY.md`

---

## 2. Scope matrix (10 pillars)

| # | Pillar | Method | Min cases | Pass bar |
|---|--------|--------|-----------|----------|
| 1 | Real Gemini SI / Singlish / EN | Live Gemini via staging turn API | 30 (10 per lang) | ≥90% intent+language match; 0 critical |
| 2 | Direct-answer accuracy | Informational asks only | 25 | ≥92% answers the ask; 0 off-topic pitch critical |
| 3 | Persistent memory | CRM reload + 12–20 turn threads | 8 threads | 100% topic/price recall on `eka` after reload |
| 4 | Redis-loss booking recovery | Flush booking key mid-flow | 5 | Context recovered; **0** fake confirms |
| 5 | Corrections / service refs | Explicit change + `eka` after | 12 | 100% stale ID cleared; correct referent |
| 6 | Multi-question completeness | 2–3 asks / message | 15 | ≥90% all units covered after ≤1 repair |
| 7 | Concurrent inbound / races | Parallel turns same phone | 6 scenarios | No cross-corrupt memory; budget atomic |
| 8 | Tenant isolation | Two staging tenants, same phone digits | 8 | 0 cross-tenant reads/writes |
| 9 | Pricing + booking safety | Verified amounts + book path | 20 | 0 invented LKR; 0 confirm without `book_appointment.ok` |
| 10 | Budget + model fallback | Cap / planned / router logs | 10 | Cap enforced; Hydrogen stops at planned; safe handoff |

**Critical failure (any one fails the evaluation):** false booking confirm · invented price · cross-tenant leak · WA message sent · production data touched · budget hard-cap bypass under concurrency.

---

## 3. Detailed case catalogue

### Pillar 1 — Language understanding (live Gemini)

| ID | Input (examples) | Expect |
|----|------------------|--------|
| L-SI-01 | Sinhala Unicode price ask | Reply uses Sinhala or clear SI-friendly; answers price via backend |
| L-SG-01 | `Keratin eka keeyada?` | Singlish Latin reply; verified amount |
| L-EN-01 | `How much is a butterfly cut?` | English; verified or honest “confirm with team” |
| L-SG-02 | `Ekata kochchara welawak yanawada?` after keratin | Duration for keratin, not new topic |
| L-MIX-01 | Typo-heavy Singlish | Still on-ask; no language dump mismatch |

### Pillar 2 — Direct-answer accuracy

| ID | Ask | Fail if |
|----|-----|---------|
| A-01 | Price only | Booking CTA only / unrelated bridal pitch |
| A-02 | Branch / hours | Service recommend instead of location/hours |
| A-03 | Advice (`hodaida`) | Immediate book lock without advice |
| A-04 | Unknown catalogue item | Invented price/name |

### Pillar 3 — Persistent memory

| ID | Steps | Expect |
|----|-------|--------|
| M-01 | Discuss keratin → reload memory row → `Eka keeyada?` | Keratin + prior verified price in context/actions |
| M-02 | 15-turn thread with 2 topic switches | Latest topic wins; Q&A ≤12 unique; no dup storms |
| M-03 | Process restart (staging AI only) | CRM meta still loads via `memoryToContext` |

### Pillar 4 — Redis-loss recovery

| ID | Steps | Expect |
|----|-------|--------|
| R-01 | Select service → date → `DEL` Redis booking key → send time | CRM recalls service+date; Redis IDLE; **no** auto-confirm |
| R-02 | Same + AI replies “appointment confirmed” | Validator / fake-book gate blocks or strips |
| R-03 | After loss, customer corrects service | `last_service_id` null; new topic |

### Pillar 5 — Corrections

| ID | Steps | Expect |
|----|-------|--------|
| C-01 | Keratin selected → `nemei haircut` | Topic haircut; service_id cleared |
| C-02 | Then `Eka keeyada?` | Haircut price path, not keratin ID |
| C-03 | Date correction | Date field updates; service unchanged |

### Pillar 6 — Multi-question

| ID | Message | Expect |
|----|---------|--------|
| Q-01 | Price + duration + branch | All three signals in final reply |
| Q-02 | Two style prices | Completeness / repair ≤1 |
| Q-03 | Partial catalogue | Honest unknown for missing part |

### Pillar 7 — Concurrency / races

| ID | Scenario | Expect |
|----|----------|--------|
| X-01 | 2 parallel turns same conversation | Final CRM memory coherent; Q&A deduped |
| X-02 | Parallel budget reserves near cap | Atomic reject; no overspend past hard cap |
| X-03 | Parallel correction + price ask | Correction wins for service identity |

### Pillar 8 — Tenant isolation

| ID | Scenario | Expect |
|----|----------|--------|
| T-01 | Tenant A memory; Tenant B same phone | Separate rows; B cannot read A meta |
| T-02 | Patch with `tenant_id: other` | `assertPatchTenant` drops / no merge |
| T-03 | Redis keys | `session_key` prefix differs by tenant |

### Pillar 9 — Pricing & booking safety

| ID | Scenario | Expect |
|----|----------|--------|
| P-01 | Known service price | `pricing_resolver` amount == reply LKR |
| P-02 | Gemini invents different LKR | Self-repair / gate / fail card |
| P-03 | “locked in / confirmed” without tool | Blocked |
| P-04 | Real staging book with synthetic customer | Confirm only if `book_appointment.ok` |

### Pillar 10 — Budget & routing

| ID | Scenario | Expect |
|----|----------|--------|
| B-01 | Short `hi` | Routes Flash-Lite (or documented fallback) |
| B-02 | Complex compare near planned $16 | Hydrogen downgraded to Flash |
| B-03 | Hard cap exhausted | Safe reply + handoff; **no** booking confirm |
| B-04 | Per-call accounting | tenant, conv, model, tokens, estimated USD present; no API key / raw dump abuse |
| B-05 | Dashboard | Staging `GET .../ai-budget` shows spend by model |

---

## 4. Execution sequence (after approval only)

1. **Written approval** naming: staging host, staging tenant ID, Gemini project, evaluator.
2. Provision staging stack; confirm WA outbound off.
3. Deploy **RC9a** deployable files only; leave RC8/RC9/RC9a zip/snapshot folders intact.
4. Seed catalogue + synthetic phones.
5. Smoke: health, Redis ping, one gated price turn.
6. Run pillars 1→10 in order; stop on any **critical** failure and file incident card.
7. Produce `SUMMARY.md` with pass/fail rates and full critical list.
8. **STOP again** — no production promotion without a separate deploy approval.

Estimated effort: **1–2 staging days** (Gemini live + concurrency), excluding provision delays.

---

## 5. Pass / fail decision

| Outcome | Criteria |
|---------|----------|
| **PASS (staging)** | All critical = 0; each pillar meets pass bar; evidence pack complete |
| **CONDITIONAL** | Non-critical gaps only; listed remediations; no safety-critical misses |
| **FAIL** | Any critical failure, or pillar pass bar missed |

Promotion to production is **out of scope** for this plan.

---

## 6. Explicit non-goals (this evaluation)

- Production deploy / restart  
- Live WhatsApp to real customers  
- Commit / push  
- Overwriting `_release/phase6_t28_rc8|rc9|rc9a`  
- Declaring success from local unit tests alone  

---

## 7. Approval checklist (fill when authorizing)

- [ ] Staging host / URL: _______________  
- [ ] Staging tenant ID: _______________  
- [ ] Gemini staging project authorized: _______________  
- [ ] WA outbound confirmed disabled: _______________  
- [ ] Evaluator: _______________  
- [ ] Date authorized: _______________  

**Until this checklist is signed, do not begin staging evaluation.**

---

**STOP** — Plan prepared only. Awaiting separate approval to begin staging evaluation.
