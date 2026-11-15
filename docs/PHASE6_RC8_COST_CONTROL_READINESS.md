# Phase 6 RC8 — Gemini $20 monthly cost control (local candidate)

**Status:** LOCAL ONLY — not deployed, not committed, not WhatsApp-tested.  
**Parent:** phase6_t28_rc7 (immutable production until separate approval)  
**Package:** `_release/phase6_t28_rc8`

## Policy

| Knob | Value |
|------|-------|
| Monthly hard cap | **$20** |
| Monthly planned usage | **$16** |
| Safety reserve | **$4** |
| Target avg / conversation | **$0.016** (1,000 conv / $16) |
| Warn / conversation | **$0.020** |
| Hard / conversation | **$0.030** |
| Daily planned | **~$0.53** |
| Alerts | 70% / 85% / 95% of hard cap |

## Official models (Google AI Studio / Gemini Developer API, 2026-11-15)

| Role | Model ID | Paid input / output per 1M |
|------|----------|----------------------------|
| Simple classify / FAQ / translate | `gemini-3.1-flash-lite` | $0.25 / $1.50 |
| Normal conversation | `gemini-3.8-flash` | $0.75 / $3.75 (promo thru 2026-12-31) |
| Complex / ambiguity | `gemini-4-hydrogen` | $1.50 / $7.50 |
| **Blocked** in normal routing | `gemini-4-argon` | recorded only |

Source: https://ai.google.dev/gemini-api/docs/pricing

## What shipped locally

1. **`ai_engine/app/cost_router.py`** — tier routing, official rates, history trim, per-call accounting record (no API keys / no message bodies).
2. **`ai_engine/app/budget_ledger.py`** — atomic Redis Lua reserve/settle/release with short timeouts; in-memory fallback; alert firing; budget-exhausted safe reply (never fake-books).
3. **`ai_engine/app/main.py`** — trim recent messages; route + reserve before Gemini; settle/accounting after; hard-cap → safe handoff.
4. **Backend** — `geminiBudgetReport.js`, `GET /crm/analytics/ai-budget`, rate seeds for RC8 models in `aiUsageCost` / `ensureAiCrmSchema`.
5. **Frontend** — `CrmAiCostPage` monthly budget panel (spend by model, avg/P95, tokens, routing mix, repair/retry).
6. **Tests** — `tests/test_rc8_cost_router_budget.py` (8 passed).

## Enforcement behaviour

- At **planned ($16)**: Hydrogen escalation stops; complex turns downgrade to Flash.
- At **hard ($20)**: atomic reserve fails → verified safe reply + human handoff (`ai_monthly_budget_exhausted`). **No booking auto-confirm.**
- Per-call accounting includes tenant, conversation, model, input/output/thinking/cached tokens, retry/repair, estimated USD, reconciliation status=`estimated_official_rate`.

## Safety / deploy gate

- Production model configuration on the live host is **unchanged**.
- No production restart, no live WhatsApp testing, no commit/push in this RC.
- Wait for **separate written approval** before staging evaluation or deployment.
- Suggested deploy env (when approved): keep existing prod model unless intentionally switching; optional `GEMINI_COST_ROUTER=1`, `GEMINI_MONTHLY_HARD_CAP=20`, `GEMINI_MONTHLY_PLANNED=16`, Redis required for multi-worker atomicity.

## QA evidence (local)

```
8 passed in 0.14s  (test_rc8_cost_router_budget.py)
```
