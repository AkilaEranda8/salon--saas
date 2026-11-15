# AI Conversation Intelligence Report — Phase 2+

**Tenant:** 28 · Salon Larvendo  
**Date:** 2026-11-14  
**Mode:** Local implementation only — **no deploy / restart / commit / push**

---

## 1. What was built

### New module: `ai_engine/app/conversation_intelligence.py`

| Capability | Implementation |
|---|---|
| Intent taxonomy (V2) | greeting, price, service, duration, image, recommend, book/continue, cancel, reschedule, hours, branch, staff, discount, correction, clarification, objection, handoff, casual, language, advice |
| Context-aware classify | Uses prior topic, memory, booking pause state, media flag |
| Topic switch detection | Compares prior vs new topic (with treatment aliases) |
| Emotion / objection | urgency · confusion · objection · frustration · neutral |
| Response decision (V2 §17) | `latest_ask_first` + action: direct_answer / correct_and_reanswer / analyze_media / verified_price / booking_tool_flow / handoff / … |
| Prompt block | `format_context_for_prompt()` for Gemini system |
| Memory patch | `memory_patch_from_context()` → meta fields for CRM memory |

### Wired into turn pipeline (`main.py`)

1. After language/script detection, build `ConversationContext`.
2. Emit `conversation_intelligence` action (intent, topic, decision, memory_patch).
3. Inject structured CONVERSATION CONTEXT into Gemini system prompt.
4. Enrich THINK block with CI must-answer + correction prior question.
5. Prefer CI intent over legacy keyword `understand_ask` labels.
6. System rules updated: **latest ask > context > pending booking**.

### Memory (`crmAiMemoryService.js`)

Persists: `script_mode`, `current_topic`, `last_intent`, `booking_paused`, `unresolved_question`, `last_quoted_price`, merged preferred services from CI patch.

### Preserved from Phase 2 P0

- Booking pause/resume · media yield · correction yield · verified cancel · always-reply guards · pricing resolver hard-gate.

---

## 2. Architecture (clean separation)

```
A. Gemini Conversation Intelligence  ← CI context + prompts + think block
B. Conversation Context Manager      ← conversation_intelligence.py + CrmAiMemory
C. Business Validation               ← pricing_resolver + salon tools
D. Action Execution                  ← booking_flow SM (paused when needed)
E. Response Quality                  ← reply mismatch retry + PRICE LOCK + verified cancel
```

Gemini still does **not** write DB rows directly — tools/APIs only.

---

## 3. Natural behaviours enabled

| Scenario | Behaviour |
|---|---|
| Keratin price → Bra Strap → Saturday | Topic retained; Saturday continues keratin (not “which service?”) |
| Mid-book + facial price | Pause booking; answer facial; resume on continue/date |
| Photo mid-book | Vision path; never treat as date |
| “Ahana deta nemei…” | Correction intent → re-answer prior ask; no generic welcome |
| Objection “expensive” | Acknowledge + verified alternatives (prompt + decision) |
| Image + caption | `INTENT_IMAGE` + analyze_media decision |

---

## 4. QA evidence (this phase)

| Suite | Result |
|---|---|
| Full ai_engine pytest (P0 + pricing + flows + Phase2+) | **359 passed** |
| Phase 2+ conversation suite alone | **244+ collected** (257 nodes before last trim; ≥200 required) |
| Behaviour harness | **17/17 (100%)** |

See also: `docs/AI_200_CONVERSATION_TEST_REPORT.md`, `docs/PHASE2_PLUS_QA_AND_READINESS.md`.

---

## 5. Safety

- Tenant id passed through context; no cross-tenant hardcoding.
- No production changes.
- No staff reactivation.
- Prices still backend-validated via `pricing_resolver`.
- Booking/cancel still tool-gated with verified status.
