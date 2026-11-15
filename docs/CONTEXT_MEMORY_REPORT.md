# Context Memory Report — Phase 2+

**Date:** 2026-11-14 · **Local only**

## Structured fields

| Field | Source | Use |
|---|---|---|
| current_intent / current_topic | CI classify | Gemini focus |
| last_customer_question / last_ai_response | recentMessages | Correction re-answer |
| discussed_services | memory + message hints | Continuity |
| hair_length | message / memory | Length-tier pricing |
| script_mode / language | sticky detect + memory | No random switch |
| booking_progress / booking_paused | SM + memory | Pause without wipe |
| pending_booking_question | derived from state | Do not force |
| supplied_booking_fields | draft | Skip re-asks |
| objections / unresolved_question | memory + correction | Sales + fix-ups |
| last_quoted_price | memory patch | Consistency |

## Persistence

- Redis booking session: state, draft, paused, script_mode (P0).
- `CrmAiMemory.meta`: enriched via `conversation_intelligence.memory_patch`.
- Tenant-scoped load/upsert by phone + conversation_id.

## Guarantees

- Never assume facts not in memory/draft.
- Topic switch updates topic without erasing prior services list.
- Correction sets `unresolved_question` to prior user turn.
