# RC2 — Final Approval Status

**Project:** Larvendo Salon AI  
**Tenant:** 28 – Salon Larvendo Pvt LTD  
**Release path:** `_release/phase4c_t28_rc2/`  
**Date:** 2026-11-14  

## Decision

# DEPLOYED (RC2) — WhatsApp still HOLD

**Deployment:** APPROVED and **EXECUTED** 2026-11-14 (`APPROVED TO DEPLOY RC2`)  
**Evidence:** `docs/RC2_DEPLOYMENT_EXECUTION_REPORT.md`, `_scripts/_rc2_deploy_evidence.json`  
**WhatsApp smoke:** NOT AUTHORIZED  
**Post-deploy:** Observe; run WA smoke only after separate approval  

---

## Status legend

| Label | Meaning |
|---|---|
| VERIFIED | Confirmed with local evidence in this prep |
| OPERATOR ACTION REQUIRED | Checklist ready; human must complete |
| BLOCKED | Cannot proceed until a dependency clears |
| NOT AUTHORIZED | Explicitly out of scope / forbidden now |

---

## 1. RC2 integrity

| Item | Status | Evidence |
|---|---|---|
| MANIFEST SHA-256 match | VERIFIED | `_scripts/_rc2_integrity_verify.json` → `manifest_files_ok: true` |
| SHA256SUMS | VERIFIED | `sha256sums_ok: true` |
| Import smoke (bundle meta) | VERIFIED | `import_ok: true` |
| RC1 untouched | VERIFIED | `rc1_manifest_self_check_ok: true` |
| RC2 bundle modified this run | VERIFIED (unchanged policy) | Docs/prep only; bundle not rewritten |
| Changed vs RC1 | VERIFIED | `main.py`, `pricing_resolver.py` only |

## 2. Key rotation

| Item | Status | Notes |
|---|---|---|
| Exposed staging key identified as compromised | VERIFIED | Chat exposure; treat as burned |
| Revoke in Google AI Studio | OPERATOR ACTION REQUIRED | No console access from this agent |
| Generate replacement key | OPERATOR ACTION REQUIRED | Operator only |
| Store in `.env.gemini.local` | OPERATOR ACTION REQUIRED | Operator only |
| `.env.gemini.local` gitignored | VERIFIED | `.gitignore` line 10; `git check-ignore` OK |
| No key in `_release/**` | VERIFIED | Scan hits: none |
| No secret printed / in reports | VERIFIED | Docs use blank placeholder; harness fingerprint length only |
| Rotation complete | BLOCKED | Until operator finishes revoke + store |

## 3. Snapshot readiness

| Item | Status | Notes |
|---|---|---|
| Snapshot checklist written | VERIFIED | `docs/RC2_PRODUCTION_SNAPSHOT_CHECKLIST.md` |
| App / AI engine file backup steps | VERIFIED | Documented |
| Backend + worker backup steps | VERIFIED | Documented |
| DB backup steps | VERIFIED | Documented; needs auth |
| Env/config secure backup | VERIFIED | Names-only inventory; restricted path |
| Prod hash baseline referenced | VERIFIED | Phase 4C table + “trust live snapshot” |
| Nginx / process config | VERIFIED | Documented where applicable |
| Restore procedure | VERIFIED | In snapshot checklist §9 |
| Execute snapshot on production | NOT AUTHORIZED | Await deploy approval |

## 4. Deployment plan review

Source: `docs/RC2_FINAL_DEPLOYMENT_EXECUTION_PLAN.md` + `_release/phase4c_t28_rc2/DEPLOY_ORDER.txt`

| Check | Status | Finding |
|---|---|---|
| Deployment order | VERIFIED | CREATE `pricing_resolver` + `conversation_intelligence` → REPLACE `booking_flow` + `main` → health → JS backend **and** worker |
| Python module dependencies | VERIFIED | `main` hard-depends on `pricing_resolver`; CI/booking present in bundle; never restart after only `main.py` |
| Backend / worker integration | VERIFIED | Same `crmInboundTurnService.js` / `crmAiMemoryService.js` mirrored; memory patch for length follow-ups |
| Health-check sequence | VERIFIED | ai_engine `/health` 200 before JS cutover completion |
| Database compatibility | VERIFIED | No migrations in RC2 |
| Rollback sequence | VERIFIED | Snapshot-first; RC1 immutable reference; delete new modules only if rolling to pre-pricing baseline |
| Post-deployment verification | VERIFIED | Hash vs SHA256SUMS; then authorized smoke |
| Execute deploy | NOT AUTHORIZED / BLOCKED | HOLD |

## 5. WhatsApp smoke-test readiness

Source: `docs/RC2_WHATSAPP_SMOKE_TEST_PLAN.md`

| Coverage | Status |
|---|---|
| Sinhala | VERIFIED |
| Singlish | VERIFIED |
| English | VERIFIED |
| Keratin Shoulder Rs 25,000 | VERIFIED |
| Galaxy clarification / no invent | VERIFIED |
| Butterfly verified pricing | VERIFIED |
| Image inquiry | VERIFIED |
| Topic switch + booking pause | VERIFIED |
| Booking | VERIFIED |
| Cancellation | VERIFIED |
| Human handoff | VERIFIED |
| Duplicate-message prevention | VERIFIED (row D5) |
| Send any WhatsApp | NOT AUTHORIZED |

## 6. Remaining operator actions

1. **Revoke** the exposed staging Gemini key in Google AI Studio.  
2. **Create** a new staging key; write it **only** into `.env.gemini.local` (or vault).  
3. After **explicit deploy approval**: run `RC2_PRODUCTION_SNAPSHOT_CHECKLIST.md` on the server.  
4. Deploy **only** from `_release/phase4c_t28_rc2/` per execution plan (separate approval).  
5. After **separate WA authorization**: execute `RC2_WHATSAPP_SMOKE_TEST_PLAN.md` on the test number.  
6. Sign smoke PASS/FAIL; rollback on critical pricing/booking/tenant failure.

---

## Final status

| Field | Value |
|---|---|
| Integrity | VERIFIED |
| Operator prep docs | VERIFIED |
| Key rotation | OPERATOR ACTION REQUIRED / BLOCKED |
| Prod snapshot | NOT AUTHORIZED |
| Deploy | **HOLD — NOT APPROVED** |
| WhatsApp | **NOT AUTHORIZED** |

**STOP — wait for review. No deployment or WhatsApp smoke is authorized by this document.**
