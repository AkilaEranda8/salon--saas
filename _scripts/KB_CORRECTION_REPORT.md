# KB Correction Report — Google articles #27 / #28

**Tenant:** 28 only  
**Date:** 2026-11-14  
**Service price rows:** unchanged  

## Change

| Field | Before | After |
|---|---|---|
| Ladies Hair Cut duration in body | **75 min** | **45 min** (official) |
| Price LKR 3500 | unchanged | unchanged |
| Title | (Phase 1 cleaned) | unchanged |
| Priority | 72 | 72 |

## Isolation

- Updated only `crm_knowledge_articles` where `tenant_id=28` and `id IN (27,28)`.
- Knowledge cache invalidated for tenant 28.

## Rollback

Bodies saved in `_scripts/_kb_27_28_duration_fix.json` → `rollback.restore_bodies`.

## Verification

- `still_has_75`: false for both  
- `has_45`: true for both  
