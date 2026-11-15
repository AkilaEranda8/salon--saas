# GEMINI_CONVERSATION_ROOT_CAUSE_REPORT.md

**Phase:** 1 — Architecture audit + root-cause analysis  
**Tenant:** 28 · Salon Larvendo Pvt LTD  
**Date:** 2026-11-14  
**Status:** COMPLETE — **no implementation, no deploy, no commit, no production changes**  
**Stop gate:** Awaiting review before Phase 2+

---

## 0. Executive verdict

The current Larvendo WhatsApp AI is **not Gemini-first**. It is a **keyword booking state machine that runs first**, with Gemini used only when the SM returns `None`, then pricing resolver, then Gemini, then soft/always-reply fallbacks.

That priority inverts the V2 requirement:

> Customer's latest actual request > Conversation context > Pending booking state > Generic fallback

**Today the order is effectively:**

> Pending booking SM step > Book-intent regex > Pricing hard-gate > Gemini > Soft/always-reply templates

All six screenshot-class failures reproduce on production T28 (conversation `24`, 2026-11-14) with logged `meta.actions` evidence.

---

## 1. System under investigation

### 1.1 Pipeline

```
WhatsApp (Baileys)
  → whatsappWebService (image/audio base64)
  → crmInboundTurnService.enqueueInboundTurn → BullMQ WA_INBOUND_AI
  → aiCrmWorker (per-phone Redis lock)
  → crmInboundTurnService.processInboundAiTurn
       memory + last 8 msgs + KB + rules + credits
  → ai_engine POST /v1/turns
       1) booking_flow SM          ← WINS if reply ≠ None
       1b) pricing_resolver        ← price asks only (local harden; prod may lag)
       2) Gemini (+ vision)
       soft fallbacks on provider failure
  → outbound WA + always_reply guards
```

### 1.2 Primary files

| Layer | Path |
|---|---|
| Turn API | `ai_engine/app/main.py` (`turns`) |
| Booking SM | `ai_engine/app/booking_flow.py` |
| Pricing | `ai_engine/app/pricing_resolver.py` |
| Gemini | `ai_engine/app/provider/gemini_provider.py` |
| Session | `ai_engine/app/session_store.py` |
| Inbound | `backend/services/crmInboundTurnService.js` |
| Memory | `backend/services/crmAiMemoryService.js` |
| WA media | `backend/services/whatsappWebService.js` |

### 1.3 Prior reports read

- `docs/AI_ENGINE_DEPLOYMENT_APPROVAL_REPORT.md`
- `_scripts/PHASE1_IMPLEMENTATION_REPORT.md`
- `_scripts/PHASE1_QA_REPORT.md`
- `_scripts/QA_LARVENDO_T28_REPORT.md`
- `_scripts/ARCHITECTURE_AUDIT.md`
- `docs/GEMINI_PRICE_FALLTHROUGH_AUDIT.md`

### 1.4 Live evidence source

Read-only prod probe: `_scripts/_probe_v2_conversation_failures.json`  
(Also prior: cancel false-confirm probe `_scripts/_probe_appt145_and_navee.json`)

---

## 2. Architectural root causes (systemic)

### RC-A — Booking SM is the conversational brain

`main.py` `turns()` calls `handle_booking_turn` **before** Gemini. Any non-`None` SM reply returns immediately — no intent LLM, no vision, no correction handling.

```949:978:ai_engine/app/main.py
    # 1) Booking / cancel / reschedule state machine (tools) — skip when customer wants a human
    ...
            if booked is not None:
                ...
                return TurnResponse(
                    replyText=booked_text,
                    ...
                )
```

**Impact:** Gemini cannot “understand what the customer means” when Redis session is mid-book, even if the new message is an image, complaint, or service question.

### RC-B — Intent is keyword/regex, not Gemini NLU

| Detector | Mechanism | Problem |
|---|---|---|
| `detect_intent` | regex book/cancel/reschedule | Over-triggers on `oni` / `karaganna` |
| `is_faq_message` | price/hours/location regex | Narrow; misses corrections |
| `is_side_ask` | `_SIDE_ASK_RE` | Misses photos, bare keratin, corrections |
| `_understand_customer_ask` | keyword think-block | Labels for Gemini; not a true intent engine |

`_BOOK_ACTION_RE` includes bare `\boni\b|\bona\b` and `karaganna` — detail/want language is treated as **book now**.

```672:679:ai_engine/app/booking_flow.py
_BOOK_ACTION_RE = re.compile(
    ...
    r"|\boni\b|\bona\b|mata\s*oni|kara\s*ganna|karaganna"
```

### RC-C — Pending booking state outranks new questions

Mid-flow FAQ/side-ask returns `None` (pause for Gemini) **but keeps Redis state**. Next message that fails `is_side_ask` is consumed as a step answer (`continue`) → re-asks date/time.

```1518:1554:ai_engine/app/booking_flow.py
    # FAQ ... Mid-flow: pause booking session (keep state)
    ...
            return None
    ...
        elif expected and is_side_ask(message, expected=expected):
            ...
            return None
```

`faq_with_knowledge` is passed into the SM body but **never read** — dead parameter.

### RC-D — Images never reach Gemini when SM is mid-book

Inbound substitutes text:

```109:111:backend/services/crmInboundTurnService.js
  if (!message && images.length) {
    message = '[Customer sent a photo]';
  }
```

In `AWAIT_DATE`, `[Customer sent a photo]` is not a date and not a side-ask → `bad_date` / re-ask date. Vision bytes are never used that turn.

### RC-E — Generic always-reply / soft fallbacks replace real answers

`alwaysReplyText` returns a canned “say *book*, prices, or hours” string. Used on empty model reply, provider failure, and **deduped_ack** replacement. Correction messages often hit this path while SM still owns the session.

### RC-F — Cancel interrupt session save bug (confirmed live)

When cancel starts mid-book:

1. `do_reset()` rebinds outer `sess` to a new IDLE `Session` and sets `cleared=True` (Redis wiped to IDLE).
2. Body’s `sess` parameter still points at the **old** object; cancel confirm mutates that old object.
3. `_attach_flow_state(result, sess)` uses the **outer** IDLE sess → meta shows `state: idle` while reply text is cancel-confirm.
4. `finally: if not cleared: save_session` **skips save** → Redis stays IDLE.
5. Customer `yes` → Gemini invents “cancel kara” → **appointment never cancelled**.

Live: Appt `#145` still `confirmed` after AI said cancel succeeded (msg `384`, Gemini, no `cancel_appointment` tool).

### RC-G — Language / script_mode split brain

- Redis SM stores `script_mode`.
- Gemini path recomputes script_mode from current + one history message.
- Memory stores `language` not `script_mode`.
- Always-reply Singlish → **Unicode Sinhala** template.
- Observed corruption: `Sinhala wal ින්uth` (msg `389`) — broken Unicode / mixed script.

### RC-H — Pricing invent residual (orthogonal but related)

Local `pricing_resolver` hard-gate exists; production deploy of that package still **awaits separate approval**. Keratin length quotes via Gemini still marked “guide price” in live chats. V2 requires verified catalogue/official list only — already designed in prior harden, not yet the conversation-routing fix.

---

## 3. Screenshot failure modes → evidence → root cause

Screenshots were not attached as image files in-repo; the same behaviours are **logged on T28 production** today (conv `24`).

### Failure 1 — Hairstyle image → AI asks appointment date

| | |
|---|---|
| **Live** | Inbound `394` `[Customer sent a photo]` → Outbound `395` “Please send a date like *today*, *tomorrow*…” |
| **Meta** | `booking_flow_state: await_date` · no Gemini usage · no `vision_images` |
| **Root cause** | RC-A + RC-D + RC-C. SM mid-date owns the turn; photo placeholder fails date parse; `is_side_ask` false for photo text. |
| **Contrast** | Idle photo `324`→`325` **did** reach Gemini vision (length estimate) — proves vision works when SM does not block. |

### Failure 2 — “Ahana deta nemei reply denn oya” → generic greeting

| | |
|---|---|
| **Live** | Inbound `396` `Ahana deta nemei rply denn oya` → Outbound `397` “Got it! How can I help… say *book*, ask prices, or hours.” |
| **Meta** | `always_reply: true` · still `booking_flow_state: await_date` |
| **Root cause** | RC-E + RC-C. Correction/complaint is not FAQ/side-ask; SM or always-reply path wins; **no re-read of prior unanswered question**. |
| **Note** | “Ahana” appears to be customer rejecting a wrong AI name/topic — there is **zero** dedicated correction intent. |

### Failure 3 — Keratin ask → unrelated booking question

| | |
|---|---|
| **Mechanism** | Mid-`await_date` + bare “keratin” often fails `_SIDE_ASK_RE` (has `treatment` but not bare keratin) → date re-ask. IDLE + `oni`/`karaganna` → `intent=book` → auto-assign → **ask date immediately**. |
| **Live** | Mixed: some keratin turns answered by Gemini with length ask (`393`); forced date still dominates when session mid-book (photo/`await_date`). |
| **Root cause** | RC-B + RC-C. |

### Failure 4 — Service details before booking → booking push

| | |
|---|---|
| **Live** | `392` `book kara gann kalin details kiyana` → Gemini keratin length reply `393` (better). Earlier flows: want-language → book SM → date. |
| **Root cause** | RC-B (`_BOOK_ACTION_RE` / service+want). Product path jumps service → **skip stylist → ask date** (`_auto_assign_staff_ask_date`) before details are satisfied. |
| **V2 gap** | No “details-first / sales-consult” mode separate from booking SM. |

### Failure 5 — Unexpected language switch / corruption

| | |
|---|---|
| **Live** | `389`: “Pulwan! Anik welawe mata Sinhala wal **ින්uth** katha…” corrupted Sinhala infix in Latin Singlish. |
| **Also** | Always-reply uses full Sinhala Unicode for Singlish Latin inbound (`alwaysReplyText`). |
| **Root cause** | RC-G. Dual detectors + template language ≠ sticky script_mode; missing Unicode hygiene on model output. |

### Failure 6 — Pending booking overrides new question

| | |
|---|---|
| **Live** | After booking progress, photo `394` and correction `396` still answered as date-step / always-reply while `await_date`. |
| **Root cause** | RC-C. Pause-for-understanding keeps state; next non-matching message resumes SM. Priority matrix violates V2 §6. |

### Bonus (same day) — False cancel confirmation

| | |
|---|---|
| **Live** | `382` cancel confirm ask → `383` yes → `384` Gemini “cancel kara” · Appt `#145` remains **confirmed** |
| **Root cause** | RC-F. Cancel session not persisted; Gemini hallucinated success without `cancel_appointment` tool. |

---

## 4. What already works (preserve)

- Multi-tenant tool scoping (`X-Tenant-Id`).
- Gemini vision path when SM yields (photo `324`→`325`).
- Memory + last-8 messages into Gemini for free chat.
- Pricing resolver design (local) — verified quotes / no invent.
- Cancel/reschedule SM with explicit yes (when session save works).
- Handoff regex + always-reply “never silent” safety net (must be narrowed, not removed).
- Sticky Singlish templates inside booking SM (`script_mode` / `t(..., sg)`).

---

## 5. Gap map vs V2 master requirements

| V2 requirement | Current | Gap severity |
|---|---|---|
| Gemini as conversational brain | SM-first | **Critical** |
| Intent-first (latest request wins) | Pending SM wins | **Critical** |
| Correction handling | None / always-reply | **Critical** |
| Image understanding always | Blocked mid-book | **Critical** |
| Booking state ≠ whole conversation | Coupled | **Critical** |
| Multilingual sticky + clean Unicode | Split + corruption | **High** |
| Verified pricing only | Local harden; prod lag | **High** |
| Structured context memory | Partial CrmAiMemory | **High** |
| Emotion / objection sales | Prompt-only | **Medium** |
| Human handoff summary packet | Partial | **Medium** |
| 200+ conversation tests | ~17 behaviour + ~99 pytest | **High** |
| Cancel reliability | Session save bug | **Critical** |

---

## 6. Recommended fix architecture (design only — not implemented)

Align with V2 §18 without rewrite:

```
A. Gemini Conversation Intelligence  (intent + reply)
B. Conversation Context Manager      (topic, pending Q, lang, booking progress)
C. Business Validation Layer         (catalogue, pricing_resolver, availability)
D. Action Execution Layer            (book/cancel/reschedule/handoff tools)
E. Response Quality Layer            (relevance, price lock, action confirm)
```

### Priority order for Phase 2+ (suggested)

| P | Change | Fixes |
|---|---|---|
| P0 | Fix `do_reset` / `cleared` / sess binding so cancel/reschedule state always saves; never claim cancel without tool OK | False cancel |
| P0 | Media / correction / “details before book” → **force SM pause** (treat as side-ask); pass images to Gemini even mid-book | F1, F2, F4, F6 |
| P0 | Priority: latest customer ask > booking step; SM only consumes clear step answers | F3, F6 |
| P1 | Soften `_BOOK_ACTION_RE` (remove bare `oni` as book); Gemini classifies book vs enquire | F3, F4 |
| P1 | Correction intent library + “re-answer prior question” path; ban always-reply for corrections | F2 |
| P1 | Persist `script_mode` into memory; Gemini uses sticky mode; Unicode sanitize | F5 |
| P2 | Deploy approved pricing_resolver (separate approval) | Pricing invent |
| P2 | Structured context object (topic, last_quote, hair_length, pending_booking_step) | Memory |
| P3 | 200+ multi-turn regression suite covering all screenshot failures | Quality gates |

**Non-goals for early phases:** rebuild from scratch; staff reactivation; cross-tenant changes; auto deploy.

---

## 7. Phase plan (unchanged from master — gated)

| Phase | Deliverable | Status |
|---|---|---|
| **1** | This root-cause report | **DONE — stop for review** |
| 2 | Gemini intent + conversation intelligence | Not started |
| 3 | Context memory + booking-state split | Not started |
| 4 | Image + multilingual | Not started |
| 5 | Pricing validation + recommendations | Not started |
| 6 | Smart booking + handoff | Not started |
| 7 | 200+ tests + regression | Not started |

Final deliverables 2–10 from the master prompt are **deferred** until Phase 1 review approval.

---

## 8. Safety compliance (this phase)

| Rule | Status |
|---|---|
| Tenant 28 only (probes) | ✅ |
| No production code change | ✅ |
| No deploy / restart | ✅ |
| No commit / push | ✅ |
| No DB migration | ✅ |
| No staff reactivation | ✅ |
| Read-only SSH probes only | ✅ |

---

## 9. Review ask

**Approve Phase 2 scope** (local only) to implement P0 items:

1. Cancel/session `cleared` + sess-binding fix  
2. Media + correction + mid-book pause so Gemini answers the real ask  
3. Step-answer gate so pending booking cannot override new questions  

No production deploy until a later **explicit** approval.

---

## 10. Evidence index

| Artifact | Path |
|---|---|
| Failure probe JSON | `_scripts/_probe_v2_conversation_failures.json` |
| Cancel gap | `_scripts/_probe_appt145_and_navee.json`, `_scripts/_probe_cancel_gap.json` |
| Prior architecture | `_scripts/ARCHITECTURE_AUDIT.md` |
| Pricing fallthrough | `docs/GEMINI_PRICE_FALLTHROUGH_AUDIT.md` |
| Deploy (pricing) still pending | `docs/AI_ENGINE_DEPLOYMENT_APPROVAL_REPORT.md` |
