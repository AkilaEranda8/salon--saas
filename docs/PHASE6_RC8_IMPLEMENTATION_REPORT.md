# Phase 6 RC8 — Implementation report

## Goal

Hold Gemini spend to **$20/month hard** (plan **$16**, reserve **$4**) at ~**1,000 conversations** (~**$0.016**/conv) via official model IDs + smart routing + atomic budget ledger.

## Routing

- Lite → `gemini-3.1-flash-lite`
- Normal → `gemini-3.8-flash`
- Complex → `gemini-4-hydrogen` (disabled once monthly spent ≥ planned)
- `gemini-4-argon` never selected in `select_model`

## Cost controls implemented

- Atomic monthly reserve (Redis Lua; memory fallback for single-process / local)
- Hard-cap refusal → safe Singlish/EN reply + handoff; never invents booking confirm
- Conversation history trimmed (8 turns × 400 chars)
- Output token caps by tier (400 / 700 / 900)
- Per-call accounting action (no secrets / no customer message dump)
- Dashboard API + CRM budget panel (spend, model mix, avg/P95, tokens, repairs)

## Bug fixed during local QA

Memory-ledger reserve deadlocked when rejecting a reservation because `budget_status()` re-entered a non-reentrant `threading.Lock`. Status is now computed **after** releasing the lock.

## Production impact

**None yet.** Package `phase6_t28_rc8` is local-only. Live RC7 model/config preserved until separate deploy approval.
