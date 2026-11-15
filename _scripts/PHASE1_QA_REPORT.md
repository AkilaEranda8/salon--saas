# Phase 1 QA Report — Larvendo T28

**Date:** 2026-11-14  
**Scope:** Approved A1–A5 production data ops + B1 local pricing resolver  
**Deploy of code:** No  

---

## 1. Regression / integration tests

| Suite | Result | Evidence |
|---|---|---|
| `pytest` pricing + flows + booking | **62/62 PASS** | local `ai_engine` |
| Behaviour harness (intent/script/handoff) | **17/17 PASS (100%)** | `_qa_behaviour_local.json` |

Stale pytest assertions for “Available times” / Tamil prompt were loosened to match current copy (local test-only).

---

## 2. Data integrity checks

| Check | Result |
|---|---|
| Tenant isolation (`foreign_services_with_deactivate_ids`) | **0 / OK** |
| Soft-deactivate only (no DELETE) | **OK** |
| Keep IDs still `is_active=true` | **OK** (`202,225,240,259,291,318,319`) |
| `#291` duration 180 / price 7000 | **OK** |
| `#196` inactive | **OK** |
| KB `#27/#28` priority still 72 | **OK** |
| KB bodies unchanged on rename | **OK** |
| Staff KB lists only active stylist | **OK** (Nadeeka only) |
| Branch KB Kandy + phone | **OK** |
| A4 staff `is_active` flags unchanged | **OK** (no reactivation) |

---

## 3. Official price / duration spot checks

| Service | Expected | Live after ops | Pass |
|---|---|---|---|
| Full Dressing (Day Time) `#202` | 4000 / 120 | 4000 / 120 active | ✅ |
| Root Cover (Full Hair) `#259` | 4500 / 90 | 4500 / 90 active | ✅ |
| Front Area Relax Rebonding `#291` | 7000 / 180 | 7000 / 180 active | ✅ |
| Keratin official tiers (resolver) | 25k/30k/40k | unit-tested | ✅ |
| Ladies Hair Cut expected 3500/45 | conflict if 75 min | unit-tested escalate | ✅ |

**Known residual:** Google KB bodies `#27/#28` still mention Ladies Hair Cut **75 min** (title fixed only). Recommend Phase 2 approval to rewrite/deactivate those bodies.

---

## 4. Pricing resolver QA (B1 local)

| Case | Pass |
|---|---|
| Keratin without length → ask length | ✅ |
| Keratin bra strap → Rs 30,000 / 300 | ✅ |
| Ladies haircut fixed 3500/45 | ✅ |
| Duration conflict → escalate | ✅ |
| Rebonding vs Front Area SKU isolation | ✅ |
| Unknown service → no invent | ✅ |

---

## 5. Rollback verification

| Item | Status |
|---|---|
| Before snapshot saved | ✅ `_phase1_t28_before_snapshot.json` |
| Rollback payload | ✅ `_phase1_t28_rollback.json` |
| Apply script present | ✅ `_phase1_t28_rollback_apply.js` |
| Rollback executed | **No** (available on request) |
| Procedure reviewed | Soft restore titles + `is_active`; no deletes |

---

## 6. Remaining risks (post Phase 1)

1. Google article **bodies** still have wrong Ladies Hair Cut duration (75 vs 45).  
2. Pricing resolver **not in production path** yet.  
3. Single active stylist remains (by A4 approval).  
4. Near-duplicate category naming still noisy (not in A2 scope).  

---

## 7. Stop for review — next approvals needed

```
[ ] Wire pricing_resolver into ai_engine turn path (Phase 2 prod wiring)
[ ] Deploy ai_engine with pricing_resolver
[ ] Rewrite/deactivate Google KB bodies #27/#28 (duration fix)
[ ] Execute rollback (only if needed)
[ ] Begin Phase 3 booking polish
```

---

## Evidence files

- `_scripts/PHASE1_IMPLEMENTATION_REPORT.md`
- `_scripts/PHASE1_QA_REPORT.md`
- `_scripts/_phase1_t28_ops_result.json`
- `_scripts/_phase1_t28_before_snapshot.json`
- `_scripts/_phase1_t28_rollback.json`
- `ai_engine/app/pricing_resolver.py`
- `ai_engine/tests/test_pricing_resolver.py`
