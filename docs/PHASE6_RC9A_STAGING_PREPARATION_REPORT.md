# Phase 6 RC9a — Staging Preparation Report

**Date (UTC context):** 2026-11-15  
**Candidate:** `_release/phase6_t28_rc9a`  
**Mode:** **Preparation only** — evaluation NOT started  
**Actions forbidden & not performed:** deploy · Gemini API calls · WhatsApp send · production restart · commit/push · overwrite RC8/RC9/RC9a

---

## Executive status

| Item | Status |
|------|--------|
| Isolated staging host identified & live | **BLOCKED — not provisioned** |
| Staging MySQL ≠ production | **BLOCKED — not provisioned** (design specified) |
| Staging Redis ≠ production | **BLOCKED — not provisioned** (design specified) |
| Staging tenant + Larvendo catalogue copy | **PLANNED (928 / 929) — not created** |
| WhatsApp outbound fully disabled | **CONTROL DESIGNED — not verified on a live staging stack** |
| Gemini staging key + official model IDs | **IDs documented from official list; key NOT verified (no API calls)** |
| Budget $20 / $16 config | **Documented in env template** |
| Synthetic customers | **Prepared** |
| Evidence harness | **Prepared (dry-run)** |
| Production credentials / customer data used | **None used** |
| RC8 / RC9 / RC9a snapshots | **Preserved** |

**Verdict:** Staging preparation **artifacts ready**; **environment not ready to evaluate**. STOP for operator provision + approval.

---

## 1. Staging host and URL

| Candidate | Role | Decision |
|-----------|------|----------|
| `46.62.135.100` / `/root/xanesalon` | **Production** Larvendo T28 | **MUST NOT** be staging target |
| `docker-compose.yml` + `docker-compose.local.yml` → `http://localhost:8080` | Local isolated stack on evaluator machine | **Recommended provisional staging host** once brought up with staging DB/Redis ports |
| Dedicated staging VPS / subdomain | Preferred long-term | **Not found in repo** — operator must supply |

**Prepared URL placeholders** (`docs/staging/RC9A_STAGING_ENV.example`):

- `STAGING_BASE_URL=http://localhost:8080`
- `STAGING_AI_URL=http://localhost:8010`

**Remaining blocker:** No approved, running isolated host with staging DNS/URL signed off.

---

## 2. MySQL & Redis isolation

**Production (do not use for eval writes):**

- Host historically: production compose on `46.62.135.100`
- DB name pattern: `zanesalon` (see `.env.example`)

**Staging design (template only):**

| Service | Staging binding | Isolation rule |
|---------|-----------------|----------------|
| MySQL | `127.0.0.1:3307` / `zanesalon_staging` | Different port + DB name + credentials from prod |
| Redis | `127.0.0.1:6380/0` | Different port/DB index from prod Redis |

**Remaining blocker:** Staging MySQL/Redis instances not confirmed running; no connection proof (intentionally not probed against production).

---

## 3. Staging tenant + catalogue

| Tenant | Plan |
|--------|------|
| **928** | Primary staging tenant — clone Larvendo catalogue |
| **929** | Isolation twin (same synthetic phone digits) |
| **28** | Production Larvendo — **read-only reference only** |

Artifacts:

- `docs/staging/catalogue_clone_checklist.md`
- `docs/staging/synthetic_customers.json`

**Remaining blocker:** Tenants 928/929 and catalogue clone **not executed** (requires staging DB + approval).

---

## 4. WhatsApp outbound disabled

Findings:

- Production path enqueues `WA_OUTBOUND` from `crmInboundTurnService` / worker.
- **No verified live staging kill-switch** was confirmed in a running staging stack.
- Repo has no completed “outbound disabled” proof for an isolated host.

**Required controls before any eval (operator):**

1. Evaluate via AI HTTP `/v1/turns` only (`CRM_EVAL_HTTP_ONLY=1` in template).
2. Do **not** start Baileys / QR for staging tenant.
3. Leave Twilio WA env empty on staging.
4. Scale/pause `WA_OUTBOUND` worker consumers to **zero** on staging.
5. Prefer not wiring inbound WA webhooks to staging during RC9a eval.

**Remaining blocker:** Live verification that a staging outbound send is impossible (must be proven after stack is up — still **no WhatsApp messages** in this prep step).

---

## 5. Gemini staging key & official model IDs

**Official API model IDs** (Google AI Studio / Gemini Developer API pricing docs; used by RC8/RC9a router — **no live listing call made this step**):

| Role | Model ID |
|------|----------|
| Simple | `gemini-3.1-flash-lite` |
| Normal | `gemini-3.8-flash` |
| Complex | `gemini-4-hydrogen` |
| Blocked | `gemini-4-argon` |

**Staging key:** placeholder only in `RC9A_STAGING_ENV.example`.  
**Remaining blocker:** Operator must install a **staging-project** key and confirm models via official API model listing **after** approval (this prep step did **not** call Gemini).

---

## 6. Billing alerts & budget config

Documented staging env:

```
GEMINI_COST_ROUTER=1
GEMINI_MONTHLY_HARD_CAP=20
GEMINI_MONTHLY_PLANNED=16
```

Code defaults match RC8 policy (`cost_router.py` / `budget_ledger.py`).

**Remaining blockers:**

- Google Cloud / AI Studio **billing budget alert** for the staging project must be confirmed in console by operator.
- Staging Redis required for atomic budget under concurrency tests.

---

## 7. Synthetic customers

Prepared: `docs/staging/synthetic_customers.json`

| ID | Phone digits | Lang | Focus |
|----|--------------|------|-------|
| syn-sg-01 | 947700928001 | Singlish | memory / eka |
| syn-si-01 | 947700928002 | Sinhala | language / multi-ask |
| syn-en-01 | 947700928003 | English | pricing safety |
| syn-book-01 | 947700928004 | Singlish | Redis-loss / booking |
| syn-corr-01 | 947700928005 | Singlish | corrections |
| syn-race-01 | 947700928006 | English | concurrency / budget |
| syn-tenant-b | 947700928001 @ tenant 929 | English | isolation |

No production customer rows loaded.

---

## 8. Evaluation harness & evidence cards

| Artifact | Path |
|----------|------|
| Env template | `docs/staging/RC9A_STAGING_ENV.example` |
| Harness | `_scripts/rc9a_staging_harness.py` |
| Dry-run evidence dir | `docs/eval_runs/rc9a_staging/prep_*/` |

Dry-run result (this prep):

- `evaluation_started: false`
- `gemini_calls: 0`
- `whatsapp_messages: 0`
- Schema sample cards written only

Live harness mode **refuses** unless dry-run is explicitly disabled **and** separate eval approval exists.

---

## 9. Production credential / data check

| Check | Result |
|-------|--------|
| Production `.env` loaded into staging artifacts | **No** |
| Production customer conversations used | **No** |
| Production Gemini key exercised | **No** (no Gemini calls) |
| Production WA send | **No** |
| Snapshots RC8/RC9/RC9a | **Intact** |

---

## 10. Summary table for approval

| Field | Value |
|-------|-------|
| Staging host | **TBD** — recommend local `http://localhost:8080` or new VPS; **not** `46.62.135.100` |
| Staging tenant ID | **928** (planned); isolation **929** |
| Model availability | Official IDs listed; **runtime availability unverified** (no API call) |
| Safety checks prepared | Env kill-switch design, HTTP-only eval, synthetic phones, evidence scrubbing |
| Remaining blockers | (1) Provision isolated host (2) Staging MySQL+Redis (3) Create tenants 928/929 + catalogue clone (4) Staging Gemini key + billing alerts (5) Prove WA outbound impossible (6) Separate **evaluation** approval |

---

## Explicit non-actions this step

- No deploy of RC9a  
- No Gemini API calls  
- No WhatsApp messages  
- No production restart  
- No commit / push  
- No modification of `_release/phase6_t28_rc8|rc9|rc9a`

---

**STOP** — Staging preparation artifacts are ready. Do not begin staging evaluation or provision-sensitive live steps until separate written approval names host, tenant, Gemini project, and WA-off proof owner.
