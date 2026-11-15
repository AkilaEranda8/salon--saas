# Provider Failure Handling Report — Larvendo T28

**Date:** 2026-11-14  
**Scope:** Local only — no deploy / restart / commit / push  
**Trigger:** Soft `say *book*` generic fallback when Gemini/provider raised

## Root cause

On `result is None`, `main.py` fell through to `soft_generic_fallback` (“I can help you book… say *book*”), which:

- Implied the enquiry was handled as a booking prompt
- Forced booking SM for many non-book messages
- Dropped the customer’s original question

## Fix (`ai_engine/app/main.py`)

When primary + failover providers fail:

1. **Greetings only** → lightweight welcome (unchanged).
2. **Explicit book/cancel/reschedule intent only** → booking SM soft path.
3. **All other asks** → `soft_provider_unavailable`:
   - States temporary unavailability
   - Echoes / preserves the original question snippet
   - Offers retry or `*staff*` handoff
   - Sets `handoff.wanted` with reason `provider_unavailable`
   - Does **not** claim the ask was answered
   - Does **not** force booking

## Evidence

Independent QA `S11_provider_down` (boom provider):

- Customer: Saturday afternoon / wedding style ask  
- AI: temporary unavailable + saved question + staff — **no** “Please say *book*”

## Acceptance

- Provider-down misleading booking prompts: **0** on non-book free-form asks (local)
- Booking draft / pause state untouched by this soft path (session already saved earlier in turn)
