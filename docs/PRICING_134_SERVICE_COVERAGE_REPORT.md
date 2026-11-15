# 134-Service Pricing Coverage Report (Tenant 28 fixture)

**Source:** `ai_engine/tests/fixtures/t28_services.json` (snapshot of T28 catalogue)  
**Evidence:** `_scripts/_pricing_134_coverage.json`

## Summary

| Metric | Value |
|---:|
| Catalogue rows | **134** |
| Active (post Phase-1 soft-deactivates) | **127** |
| Inactive (kept for history) | **7** |
| Closed safe resolver paths | **127 / 127** |
| Unverified amount hits | **0** |
| OK fixed/list quotes | 124 |
| Needs length (Keratin/Botox/… name asks) | 3 |
| Clarify / escalate on exact-name sweep | 0 |

## By category (active)

All categories report `safe == n` (ok, needs_length, clarify, or escalate — never open/invent).

Includes: Facials, Waxing, Threading, Nails, Hair Cut, Fashion Colours, Hair Treatment, Dressing, Grey Cover, Manicure/Pedicure, Piercing, Wedding Arrangement, etc.

## Interpretation

- Asking `"{service_name} price"` for each active service yields only verified amounts.  
- Length-tier named services correctly divert to official length flow when appropriate.  
- Soft-deactivated duplicates are excluded from active quoting.  
