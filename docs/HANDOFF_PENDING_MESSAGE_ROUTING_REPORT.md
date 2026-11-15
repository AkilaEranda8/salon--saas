# Handoff Pending Message Routing Report — Larvendo T28

**Date:** 2026-11-14  
**Priority:** CRITICAL  
**Environment:** Production investigated read-only; fix **local only**  
**RC candidate:** `phase4c_t28_rc5`  
**Production:** unchanged (no deploy · no restart · no WhatsApp)

---

## 1. Root cause (evidence-based)

### Code path (local + deployed worker probe)

In `crmInboundTurnService.js`, when `conversation.status` is `queued` or `human_active`:

1. Inbound message is persisted with `skipped_ai: true`.
2. AI / Gemini / FAQ path is **never called**.
3. A generic acknowledgement is sent at most once per **120 seconds**:
   - EN: `Got your message ✅ A teammate will reply shortly.`
4. Staff re-notify is attempted (throttled).
5. Function returns `{ skipped: true }`.

**Deployed probe (read-only):**

```text
HAS_QUEUED_GATE true
HAS_HANDOFF_ACK true
ACK_TTL_120 true
```

### Matches the reproduced conversation

| Customer | Observed | Mechanism |
|---|---|---|
| Kochchara wela yai da? | Generic teammate ack | Handoff gate + ack |
| Oyage salon eka koheda… | Same generic ack | Ack allowed again after 120s **or** first ack of window |
| Koheda? | **No response** | Inside 120s TTL → ack suppressed → **no AI reply either** |

Handoff is set when AI returns `turn.handoff` → status becomes `queued` (confirmed in same service).

This is **not** a webhook drop: messages are stored; **customer-facing answer routing is disabled**.

---

## 2. Required vs previous behaviour

| Requirement | Before | After (local RC5) |
|---|---|---|
| Persist every inbound | ✅ | ✅ |
| Answer verified FAQ during handoff | ❌ skipped | ✅ AI assist, status kept |
| No repeated generic ack | ❌ every 120s | ✅ **one per handoff episode** (4h TTL) |
| Never silent no-reply on FAQ | ❌ | ✅ |
| Keep handoff active | ✅ (but AI off) | ✅ status preserved after assist |
| False callback spam | ❌ | ✅ removed generic repeat |

---

## 3. Fix design

| File | Role |
|---|---|
| `crmHandoffInboundPolicy.js` | **New** — `shouldAssistDuringHandoff`, FAQ detection, episode ack copy |
| `crmInboundTurnService.js` | Route FAQ/substantial asks to AI while preserving `queued`/`human_active` |
| `booking_flow.py` | Expand FAQ regex (koheda / kochchara wela / kandy) |
| `main.py` | `HANDOFF PENDING` system instructions when `customerContext.handoffPending` |

Policy summary:

- **`queued`:** FAQ + substantial asks → AI assist; human-only asks → staff path, one episode ack max.  
- **`human_active`:** FAQ only → AI assist; other messages → staff notify, no ack spam.  
- Error / success paths **must not** flip status back to `ai_active` during assist.

---

## 4. STOP

Local fix + RC5 packaged. **No production deploy** without separate explicit approval.
