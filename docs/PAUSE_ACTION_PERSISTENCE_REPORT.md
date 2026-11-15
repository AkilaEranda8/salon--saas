# Pause Action Persistence Report — Larvendo T28

**Date:** 2026-11-14  
**Scope:** Local only — no deploy / restart / commit / push  
**Trigger:** Independent QA — `_pause_booking` then `return None` discarded pause actions

## Root cause

When booking SM paused for media / side-ask / correction, `_handle_booking_turn_body` returned `None`. Session `paused=True` was saved in `finally`, but pause actions never reached `TurnResponse` / inbound memory merge.

## Fix

| Layer | Change |
|---|---|
| `booking_flow.py` | `_yield_to_llm(sess, actions)` returns `{yieldToLlm: True, actions, flowPaused, ...}` instead of `None` after pause |
| `booking_flow.py` | Pause action includes `draft_preserved`, service/date/time snapshot |
| `main.py` | If `booked.yieldToLlm`, merge actions into turn and continue to pricing/Gemini (no SM reply) |
| `crmAiMemoryService.js` | Merge `booking_pause_for_understanding` into `booking_paused` / state / service |

## Guarantees

- Pause actions persist on the customer-facing turn.
- Draft remains; resume only via explicit `continue` / clear step answer / cancel|reschedule switch.
- Yield path does **not** call `book_appointment` or `cancel_appointment`.
- Pause tool appears once per yield (no duplicate book/cancel).

## Tests

- `tests/test_provider_unavailable_and_pause_yield.py`
- Updated P0 / Phase2+ SM yield assertions
- Independent QA `S3` / `S12` require `pause_actions`

## Acceptance

- Dropped customer pause actions on yield: **0** (local)
- Cancellation safety unchanged (verified cancel still requires tool + status)
