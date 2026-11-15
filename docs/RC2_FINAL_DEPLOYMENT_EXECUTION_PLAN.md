# Larvendo RC2 — Final Deployment Execution Plan

**Project:** Larvendo Salon AI  
**Tenant:** 28 – Salon Larvendo Pvt LTD  
**Bundle (only):** `_release/phase4c_t28_rc2/`  
**RC1:** `_release/phase4c_t28_rc1/` — **IMMUTABLE — DO NOT MODIFY / DO NOT DEPLOY AS PRIMARY**  
**Current status:** READY WITH CONDITIONS  
**Deploy status:** **NOT APPROVED — WAITING FOR EXPLICIT APPROVAL**  

---

## 0. Gate summary (pre-approval)

| Item | Status |
|---|---|
| Pytest | 499 passed (prior evidence) |
| Behaviour | 17/17 |
| Real Gemini pricing safety | 8/8 + 6/6 adversarial |
| Keratin Shoulder | Rs **25,000** enforced |
| Galaxy | No unverified price to customer |
| RC2 manifest ↔ files SHA-256 | **VERIFIED OK** (`_scripts/_rc2_integrity_verify.json`) |
| RC2 `SHA256SUMS.txt` | **VERIFIED OK** |
| RC1 self-checksum vs manifest | **OK** (untouched) |
| Key patterns in `_release/**` | **none** |
| `.env.gemini.local` gitignored | **YES** |
| Exposed staging key rotated | **OPERATOR — PENDING** |
| Authorized WA smoke executed | **NOT RUN** (await auth) |
| Prod backup/snapshot on server | **PENDING at deploy time** |

**Do not start Section 4 until Sections 1–3 are complete and written approval is recorded.**

---

## 1. Key rotation (before any deploy)

Owner: operator with Google staging console access.

Follow `docs/RC2_KEY_ROTATION_AND_STORAGE_CHECKLIST.md`.

- [ ] Revoke exposed chat key  
- [ ] Create new staging key  
- [ ] Store only in `.env.gemini.local` or vault (never chat / RC2 / git)  
- [ ] Confirm prod secret untouched  

**Blocker if incomplete:** Do not treat local harness re-runs as authorized until revoke is done.

---

## 2. Pre-deploy integrity recheck (local, no prod)

```text
cd e:\salon_v1
python _scripts\_verify_rc2_integrity.py
```

Expect: `manifest_files_ok=true`, `sha256sums_ok=true`, `rc1_manifest_self_check_ok=true`.

RC2 changed vs RC1 (only):

| File | RC2 sha16 |
|---|---|
| `ai_engine/app/main.py` | `1a3a251f5bdaaed7` |
| `ai_engine/app/pricing_resolver.py` | `27fa6ab72c6b5b6a` |

Deploy **only** files under `_release/phase4c_t28_rc2/` (see `MANIFEST.json` / `SHA256SUMS.txt`).

---

## 3. Production backup & rollback readiness (on server, at deploy time)

Host/compose context: see `docs/PHASE4_ROLLBACK_PLAN.md` / `PHASE4C_ROLLBACK_VERIFICATION.md`.

### 3A. Snapshot (mandatory before overwrite)

- [ ] Create `/root/xanesalon/_rollback/phase4c_rc2_TS/`  
- [ ] Copy live ai_engine: `main.py`, `booking_flow.py` (+ note if `pricing_resolver.py` / `conversation_intelligence.py` already present)  
- [ ] Copy backend + `ai_crm_worker`: `crmInboundTurnService.js`, `crmAiMemoryService.js`  
- [ ] Write snapshot `MANIFEST.txt` with SHA-256 (or sha16) of each file  
- [ ] Confirm no DB migrations required (RC2 introduces **none**)

### 3B. Rollback decision triggers (immediate)

- False official price (Keratin ≠ 25000; Galaxy invent; Butterfly ≠ 4500)  
- False book/cancel without DB proof  
- Cross-tenant anomaly  
- ai_engine crash / `/health` ≠ 200 / sustained 5xx on `/v1/turns`  

### 3C. Rollback order (if triggered)

1. Restore ai_engine from **this deploy’s snapshot** (preferred), or RC1 bundle files if snapshot matches RC1-era layout.  
2. If new modules were created by RC2 and were absent before: remove `pricing_resolver.py` / `conversation_intelligence.py` only when rolling all the way to pre-pricing baseline.  
3. Restart ai_engine → `/health` 200.  
4. Restore JS on backend **and** worker; restart both.  
5. Verify hashes; authorized `Hi` only if WA auth exists.  
6. Incident note: time, trigger, hashes before/after.

**Known-good pre-RC baseline (if never deployed Phase 4C):** see Phase 4C rollback doc sha16 table.

---

## 4. Deploy execution (RC2 only) — REQUIRES EXPLICIT APPROVAL

**Approval token / message id:** `________________`  
**Approver:** `________________`  
**Date/time:** `________________`  

Copy from `_release/phase4c_t28_rc2/` only. Follow `DEPLOY_ORDER.txt`:

1. **Snapshot** (Section 3A) complete.  
2. **CREATE** on ai_engine (before restart):  
   - `pricing_resolver.py`  
   - `conversation_intelligence.py`  
3. **REPLACE** on ai_engine:  
   - `booking_flow.py`  
   - `main.py`  
4. Restart **ai_engine** → `GET /health` must be **200**.  
5. **REPLACE** on **backend** and **ai_crm_worker**:  
   - `crmInboundTurnService.js`  
   - `crmAiMemoryService.js`  
6. Restart backend + `ai_crm_worker`.  
7. Post-deploy hash check against RC2 `SHA256SUMS.txt`.  

**CRITICAL:** Never restart ai_engine after copying only `main.py`.

**STOP** if health/import/tenant-isolation/pricing/booking critical failure.

---

## 5. Authorized WhatsApp smoke (after deploy + separate WA auth)

Plan: `docs/RC2_WHATSAPP_SMOKE_TEST_PLAN.md`  
**Do not send** until WhatsApp authorization is explicit.

Cover: Sinhala, Singlish, English, pricing (Keratin **25000**, Galaxy no price, Butterfly **4500**, Bra Strap **30000**), image inquiry, topic switch/pause, booking, cancellation, human handoff, tenant isolation spot-check.

- [ ] WA authorization recorded  
- [ ] Smoke PASS signed  
- [ ] Or FAIL → Section 3C rollback  

---

## 6. Post-go observation (recommended)

- Watch `/v1/turns` errors and `price_output_blocked` / `pricing_resolver` actions  
- Confirm no false Rs 15,000 Keratin shoulder quotes in customer replies  
- Keep RC1 bundle on disk for emergency reference; prefer **snapshot** for rollback accuracy  

---

## 7. Explicit non-actions (this preparation)

- No production deploy executed  
- No live WhatsApp messages sent  
- RC1 not modified  
- No production secrets retrieved  
- No commit/push required by this plan  

---

## Approval block

Reply with **exactly one** of:

1. `APPROVED TO DEPLOY RC2` — then execute Section 4 (and Section 5 only with separate WA auth).  
2. `APPROVED FOR WHATSAPP SMOKE ONLY` — Section 5 on already-deployed/staging bridge.  
3. `HOLD` — remain stopped.

Until then: **do not deploy.**
