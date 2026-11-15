# Phase 6 RC9 — Direct answer accuracy + persistent conversation memory

**Status:** LOCAL ONLY — not deployed, not committed, no WhatsApp.  
**Package:** `_release/phase6_t28_rc9`  
**Parent:** phase6_t28_rc8 (immutable until separate approval)

## Problem

The AI sometimes ignored the customer's actual question, lost prior-turn service/price context after CRM reload, and soft-passed replies that pitched booking or unrelated packages instead of answering.

## Root cause

1. **`memoryToContext` truncated CRM meta** — `qa_history`, `conversation_summary`, `pending_questions`, `correction_log`, and `conversation_truth` were written by upsert but **not returned** on load.
2. **ConversationTruth stayed Redis-only** — never stamped onto `booking_flow_state` for CRM persistence.
3. **Quality gates were soft** — advice units passed on word count; unrelated bridal / generic “date time kiyanna” pitches could survive informational asks.
4. **`verified_amounts` never wired** from pricing actions into `validate_customer_reply`.
5. Referent regex missed **`ekata`**; recall regex weak for **`kalin kiwwa`**.

## Fixes (local)

| Area | Change |
|------|--------|
| CRM load | `memoryToContext` returns full structured state + `qa_history` + `conversation_truth` |
| CRM write | Persist service_id, duration, date/time, booking_status, truth, merge all CI patches including Q&A |
| Booking | `booking_flow_state` includes `conversation_truth`, `service_id`, `duration_minutes` |
| Referents | `eka` / `ekata` / duration follow-ups / `kalin kiwwa` recall / `hari ehema karamu` |
| Prompt | Structured Q&A + corrections + “never replace ask with pitch” |
| Quality | Off-topic recommendation + generic booking-pitch fail; pass `verified_amounts` |
| Main | Append per-turn Q&A memory patch after reply |

## Failure examples (caught by tests)

| Customer | Bad AI behaviour | Gate |
|----------|------------------|------|
| `Eka keeyada?` (after keratin) | “Would you like to book? Date/time kiyanna…” | `off_topic_recommendation` / missing price |
| `Butterfly cut kiyada?` | Bridal package pitch only | `context_consistency` |
| Multi-ask price+duration+branch | Only price answered | missing duration/location units |
| Invented `Rs.99,999` vs verified `3500` | Fabricated price | `price_identity` |

## Regression results (local)

```
40 passed  (test_rc9_conversation_memory_replay + human_understanding + response_quality + rc7 truth)
2 passed   (crmAiMemoryRc9.node test — memoryToContext parity)
```

Conversation replay coverage includes: eka/ekata, kalin kiwwa, multi-question, corrections, mind-change, missing catalogue, long multi-topic chain, SI/Singlish/EN referents.

## Safety

- Existing RC folders preserved.
- Production unchanged; no restart; no live WhatsApp; no commit/push.
- Await **separate approval** before staging evaluation or deployment.
