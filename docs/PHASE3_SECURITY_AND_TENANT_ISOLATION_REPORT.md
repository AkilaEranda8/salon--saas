# Phase 3 — Security & Tenant Isolation (Larvendo T28)

**Date:** 2026-11-14  
**Evidence:** `_scripts/_phase3_validation.json` → `security`  
**Scope:** Local code/unit validation — Tenant 28 only

## Verdict

**PASS** (local isolation checks). Production cross-tenant smoke still required after deploy.

| Check | Result |
|---|---|
| CI context `tenant_id` 28 vs 99 | Distinct |
| Session keys tenant-scoped | `28:…` ≠ `99:…` |
| Memory key invent from unknown service | Rejected (`None`) |
| `crmAiMemoryService.js` filters `tenant_id` + phone | Present |
| Pause yield + provider unavailable paths | Present in code |
| No prod data modified | Confirmed |
| No real WA to customers | Confirmed |
| API keys in reports | None |

## Isolation model (verified in code)

- Booking sessions: `session_key(tenant_id, conversation_id, phone)`
- Memory upsert: `tenant_id` + phone / conversation_id
- Pricing: catalogue loaded via `list_services` for the turn’s `tenantId` (caller-scoped)
- Credentials: `resolve_provider_key(tenantId)` — never from turn body

## Residual / conditions

1. Live multi-tenant spot-check after deploy (another tenant unchanged).
2. Error logs must continue to omit raw phone payloads / keys (ops review on prod logger config).
3. Real Gemini key must stay in tenant settings / env — never in chat reports.
