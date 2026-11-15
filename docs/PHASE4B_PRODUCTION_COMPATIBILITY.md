# Phase 4B — Production Compatibility Report (Larvendo T28)

**Date:** 2026-11-14  
**Scope:** Why prod lacks modules + what a safe deploy must include  
**Evidence:** `_scripts/_phase4_prod_hashes.json`  
**No production changes made.**

## 1. Why production is missing the modules

| File on prod ai_engine | Status |
|---|---|
| `/app/app/pricing_resolver.py` | **MISSING** |
| `/app/app/conversation_intelligence.py` | **MISSING** |
| `/app/app/main.py` | Present — **older** hash `54fb1d8e327ad022` (local `a73d79a65d9f9544`) |
| `/app/app/booking_flow.py` | Present — **older** hash `1933294042289bf8` (local `f70577c7fa077e1d`) |

**Root cause:** Phase 2+ / P0–P1 / Phase 3 work was implemented and validated **locally only**. Explicit deploy approval was never given, so CREATE files were never `docker cp`’d. Production is still the pre–pricing-resolver / pre–CI binary set.

This is **expected**, not corruption.

## 2. Import / dependency graph (ai_engine)

```text
main.py
  ├── pricing_resolver.py          (stdlib only: re, dataclasses typing)
  ├── conversation_intelligence.py
  │     ├── booking_flow.py
  │     └── pricing_resolver.py
  ├── booking_flow.py
  │     ├── session_store
  │     └── tools
  └── (existing) auth, provider, tenant_credentials, tenant_rules, handoff, tools
```

**Critical:** Local `main.py` has **hard imports**:

```python
from app.pricing_resolver import ...
from app.conversation_intelligence import ...
```

Copying **only** `main.py` onto production **without** the two new modules will cause **ImportError on startup** → ai_engine down.

`conversation_intelligence` also requires the **new** `booking_flow` helpers it imports (`is_correction_message`, `is_details_before_book`, `is_resume_booking_message`, etc.). Old prod `booking_flow.py` is insufficient.

## 3. Python / Node runtime

| Layer | Requirement | Assessment |
|---|---|---|
| ai_engine | Existing FastAPI/uvicorn image | No new pip packages in these modules |
| Language | `from __future__ import annotations`, dataclasses, Optional | Compatible with current prod Python 3.x used by container |
| backend / worker | Node services already running | JS changes are additive memory/action merges — no new npm deps observed |

## 4. Environment variables

| Variable | Change needed? |
|---|---|
| `AI_ENGINE_SERVICE_SECRET` | No — must already match backend |
| `SALON_API_URL` | No |
| Tenant Gemini key in DB | No change for deploy of these files |
| New env vars | **None** |

## 5. Database schema

| Item | Need |
|---|---|
| Migrations | **None** |
| New tables | **None** |
| `CrmAiMemory.meta` JSON | Additive keys (`pricing_service_key`, `booking_paused`, …) — old rows OK |
| Appointments schema | Unchanged |

## 6. Process / service requirements

| Service | Must update? | Why |
|---|---|---|
| `ai_engine` | **Yes** — 4 Python files + restart | Pricing hard-gate, CI, pause yield, provider-unavailable |
| `backend` | **Yes** — 2 JS files + restart/reload | always_reply / memory merge |
| `ai_crm_worker` | **Yes** — **same 2 JS files** | Worker serves inbound turns; hash today matches backend old files |

Updating backend JS but **not** the worker leaves inbound path on old memory merge behaviour.

## 7. Deployment order (compatibility-safe)

Do **not** assume “copy local files” in random order is enough.

1. Snapshot prod files (rollback).  
2. **CREATE** on ai_engine (before restart):  
   - `pricing_resolver.py`  
   - `conversation_intelligence.py`  
3. **REPLACE** on ai_engine:  
   - `booking_flow.py`  
   - `main.py`  
4. Restart **ai_engine** → confirm `/health` (import graph must load).  
5. **REPLACE** JS on **backend** and **ai_crm_worker**.  
6. Restart backend + worker.  
7. Smoke (authorized).  

If step 4 fails health: restore snapshot immediately (see risk review).

## 8. Rollback compatibility

- Removing the two CREATE files and restoring old `main.py` / `booking_flow.py` returns to current prod behaviour.  
- JS rollback must hit **both** backend and worker.  
- No DB migration to undo.

## 9. Compatibility verdict

| Question | Answer |
|---|---|
| Can we hot-copy the package? | **Yes**, with strict order above |
| Is copying local files alone sufficient? | **No** — must include CREATE modules, matching booking_flow, both JS targets, restarts, health, smoke |
| Schema risk | **Low** |
| Startup risk if incomplete copy | **High** (ImportError) |
