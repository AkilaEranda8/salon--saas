# Phase 1 Implementation Report — Larvendo T28

**Date:** 2026-11-14  
**Tenant:** `#28` only  
**Deploy/commit/push:** **NOT done** (as required)  
**Staff reactivation (A4):** none — unchanged  

---

## Approved ops executed

| ID | Action | Result |
|---|---|---|
| A1 | Rename KB `#27`, `#28` titles | ✅ Done — body/priority preserved |
| A2 | Soft-deactivate 7 duplicate services | ✅ Done — rows retained |
| A3 | Keep `#291`, deactivate `#196` | ✅ Done |
| A4 | No staff reactivation | ✅ Honored |
| A5 | Refresh auto-train KB T28 | ✅ Updated articles `#23/#24/#25` |
| B1 | Pricing resolver locally | ✅ Added `ai_engine/app/pricing_resolver.py` + tests — **not wired/deployed** |

---

## Isolation

- Every mutate filtered `tenant_id = 28`.
- Pre-check aborted if service ID missing under T28.
- Foreign count for deactivate IDs on other tenants: **0**.
- Auto-train called as `autoTrainFromSalon(28)` only.

---

## A1 — KB titles

| ID | Old title | New title | Priority | Body |
|---:|---|---|---:|---|
| 27 | garbled spaced Sinhala | `Auto-train (Google): Haircut එකක් කරගන්න කීයක් යනවද?` | 72 | unchanged (647 chars) |
| 28 | garbled long title | `Auto-train (Google): Hi මට කියන්න පුළුවන්ද …?` | 72 | unchanged (742 chars) |

---

## A2/A3 — Soft-deactivate (historical refs preserved)

| Deactivated ID | Name | Kept active counterpart |
|---:|---|---|
| 306 | Full Dressing Day Time | 202 Full Dressing (Day Time) |
| 172 | Booster Pack + | 318 Booster Pack+ |
| 228 | High Frequency | 319 High-frequency |
| 302 | Hand Wax Full | 225 Hand Wax (Full) |
| 304 | Leg Wax Full | 240 Leg Wax (Full) |
| 289 | Root Cover Full Hair | 259 Root Cover (Full Hair) |
| 196 | Front Area (Relax/Rebonding) 90m | **291** Front Area Relax Rebonding **180m** |

No DELETE. Appointment rows pointing at old IDs remain valid.

### Official price/duration verify (kept SKUs)

| ID | Name | Price | Duration | OK |
|---:|---|---:|---:|---|
| 202 | Full Dressing (Day Time) | 4000 | 120 | ✅ |
| 259 | Root Cover (Full Hair) | 4500 | 90 | ✅ |
| 291 | Front Area Relax Rebonding | 7000 | 180 | ✅ |

---

## A5 — Auto-train refresh

| Article | Action | After |
|---|---|---|
| `#23` Services & prices | updated | Live catalogue (dupes excluded when inactive) |
| `#24` Staff & hours | updated | **Only Nadeeka Gamage** (active) + hours |
| `#25` Branches | updated | Larvendo Kandy + address + phone |

Stale inactive staff names removed from KB `#24`.

---

## B1 — Pricing resolver (local only)

**Files**
- `ai_engine/app/pricing_resolver.py`
- `ai_engine/tests/test_pricing_resolver.py`

**Capabilities**
- Length gate for Keratin/Botox/Rebonding/Fashion colour tiers  
- Official Shoulder/Bra Strap/Hip table  
- Live catalogue fixed prices with duration conflict → escalate  
- Avoid colliding “Front Area … Rebonding” with full Rebonding  
- Singlish + English message templates  

**Not done (needs separate approval):** wire into `main.py` turn path / production deploy.

---

## Snapshots & rollback

| File | Purpose |
|---|---|
| `_scripts/_phase1_t28_before_snapshot.json` | Pre-change state |
| `_scripts/_phase1_t28_ops_result.json` | Full before/ops/after |
| `_scripts/_phase1_t28_rollback.json` | Restore instructions + payloads |
| `_scripts/_phase1_t28_rollback_apply.js` | Soft restore script (manual) |

### Rollback procedure (verified design — not executed)

1. Copy `_phase1_t28_ops_result.json` + `_phase1_t28_rollback_apply.js` into backend container.  
2. `node /tmp/_phase1_t28_rollback_apply.js /tmp/phase1_t28_ops_result.json`  
3. Restores KB titles `#27/#28` and prior `is_active`/`available_online` on deactivated services.  
4. Optionally re-run `autoTrainFromSalon(28)` if prior auto-train bodies required.  
5. **Never DELETE** to roll back.

---

## What was NOT done

- No git commit / push  
- No docker image rebuild / ai_engine deploy of pricing resolver  
- No staff reactivation  
- No other-tenant changes  
- Google article **bodies** still contain Ladies Hair Cut 75 min (title fixed only — body rewrite not in A1 approval)
