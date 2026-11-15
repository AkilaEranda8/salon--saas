# Phase 6 RC5 — Gemini Full Human-Like Customer Understanding Engine

**Tenant:** 28 – Salon Larvendo  
**Candidate RC:** `phase6_t28_rc5`  
**Parent:** `phase6_t28_rc4` (immutable; leave on prod until approval)  
**Status:** **LOCAL ONLY — NOT DEPLOYED**  
**WhatsApp:** NOT SENT  
**Date (UTC):** 2026-11-15  

## Production reality note

The brief stated production = `phase6_t28_rc3`. Live T28 was already on **`phase6_t28_rc4`** from earlier approved hotfixes (ude time, Heya typo, slot duration, human-tone).  
RC5 is a **new local candidate** on top of that work. **No production restart / deploy / WA** in this pass.

## 1. Root cause analysis

| Gap | Root cause | RC5 fix |
|-----|------------|---------|
| “Eka keeyada?” treated as vague | Keyword intent without referent resolution | `is_referent_message` + `resolve_referent_topic` → prior `last_service` / `current_topic` |
| “Eka karanna hodaida?” | No advice-on-prior-topic path | Referent + `_ADVICE_RE` → `INTENT_RECOMMEND` with prior topic |
| “Ane mata eka baya” | Emotion ≈ neutral; no concern intent | `INTENT_CONCERN` + emotion `fear` + empathise decision |
| “Ehenam wena ekak” | No alternative intent | `INTENT_ALTERNATIVE` |
| Short replies reset feel | Weak continuation | Referent + memory topic retained in CI context block |
| Robot vs human | Safety rules over-weighted in wording | Prompt §1 human-understanding engine + prior human-tone rules |
| Pricing invent risk | Unchanged authority | Still hard-gated via `pricing_resolver`; `keeyada` cue added |

Booking / price / availability remain **backend-authoritative**. Gemini remains **NLU + natural reply** layer.

## 2. Pipeline (target architecture)

```
Inbound WA message
 → Voice/image preprocess (existing)
 → Conversation intelligence (intent, referent, emotion, decision)
 → Booking SM (only clear book/cancel/resched steps; pause on NL side-asks)
 → Pricing resolver hard-gate (verified LKR only)
 → Gemini (human reply + context block) OR SM template reply
 → Respect finalize + fake-booking claim block
 → WhatsApp delivery
```

**Conflicts addressed:** referent/advice/concern now route to Gemini-capable intents with structured must-answer, instead of generic / booking-forced paths. SM still owns confirm + `book_appointment`.

## 3. Changed files

| File | Change |
|------|--------|
| `ai_engine/app/conversation_intelligence.py` | Referents, emotions, concern/alternative/advice intents, prompt context |
| `ai_engine/app/main.py` | Human-understanding engine prompt rules |
| `ai_engine/app/pricing_resolver.py` | `keeyada` price cue |
| `ai_engine/app/booking_flow.py` | (carried) slot duration / human Singlish copy from RC4 line |
| `backend/services/crmHandoffInboundPolicy.js` | (carried) queued assist policy |
| `ai_engine/tests/test_human_understanding_engine.py` | New regression suite |

## 4. Regression results (local)

```
36 passed — human_understanding + phase6 conversation quality + heya + ude + slot duration
```

Import smoke in package: **ok**.

## 5. Real Gemini test results

**Not run against live Gemini API in this pass** (release safety: no prod keys exercised for new eval; no WA).  
Deterministic CI layer validates intent/referent/emotion before Gemini.  
Live Gemini eval requires **separate approval** (API smoke + WA).

## 6. Before / after examples

| Customer | Before (risk) | After (RC5) |
|----------|---------------|-------------|
| Eka keeyada? (after Keratin) | “Which service price?” | Intent=price, topic=keratin |
| Eka karanna hodaida? | Generic / off-topic | Intent=recommend on keratin |
| Ane mata eka baya | Neutral bot reply | Intent=concern, emotion=fear |
| Ehenam wena ekak kiyanna | New catalogue dump | Intent=alternative on prior topic |

## 7. Pricing & booking safety

- Prices: still `resolve_price` / multi-price / rejection gates — Gemini cannot invent LKR.
- Booking: still requires SM confirm + `book_appointment`; fake “lock in” hard-block retained from RC4.
- Slot duration display + combined services retained.

## 8. Manifest & checksums

- Bundle: `_release/phase6_t28_rc5/`
- `MANIFEST.json` + `SHA256SUMS.txt` + `DEPLOY_ORDER.txt` (HOLD)

## 9. Production readiness

| Item | Status |
|------|--------|
| Local package | READY |
| Deterministic QA | PASS (36) |
| Live Gemini eval | PENDING approval |
| Deploy | **STOP — wait for explicit approval** |
| WhatsApp | **NOT AUTHORIZED** |

## STOP

Local implementation + QA complete. **Do not deploy / restart / send WhatsApp** until you explicitly approve.
