# Staging tenant catalogue clone checklist (Larvendo → staging)

**Do not run against production T28 as the destination.**

## Planned tenants

| Role | Planned ID | Purpose |
|------|------------|---------|
| Staging primary | **928** | RC9a evaluation (Larvendo catalogue copy) |
| Staging isolation B | **929** | Same synthetic phone digits; must not share memory |
| Production Larvendo | 28 | **READ-ONLY reference** — never staging write target |

## Clone steps (execute only after staging DB is live + approved)

1. Create tenants `928` and `929` on **staging MySQL only**.
2. Copy from T28 (or a T28 dump restored into staging): branches, services, staff, durations, prices, hours.
3. Confirm service IDs on staging may differ from prod — tests must use staging IDs from staging `list_services`.
4. Seed zero production CRM conversations/leads — only synthetic phones from `synthetic_customers.json`.
5. Verify `CrmAiMemory` queries always filter `tenant_id` (928 vs 929).

## Verification queries (staging DB)

```sql
-- Expect rows only for 928/929 after seed; never run DELETEs on prod
SELECT id, name FROM tenants WHERE id IN (28, 928, 929);
SELECT tenant_id, COUNT(*) FROM services GROUP BY tenant_id;
SELECT tenant_id, phone, COUNT(*) FROM crm_ai_memories GROUP BY tenant_id, phone;
```
