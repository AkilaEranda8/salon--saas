# Phase 6 RC6 — Advanced Intelligent Receptionist Engine

**Tenant:** 28 – Larvendo Salon  
**Candidate:** `phase6_t28_rc6`  
**Parents:** RC5 (human understanding) ← RC4 (live) ← RC3  
**Status:** **LOCAL ONLY — NOT DEPLOYED**  
**WhatsApp:** NOT SENT  
**Date (UTC):** 2026-11-15  

---

## 1. Current architecture audit

```
WhatsApp (Baileys)
 → crmInboundTurnService / ai_crm_worker
 → AI Engine /v1/turns
     1. FAQ KB preload
     2. Booking state machine (deterministic tools)
     3. Pricing resolver hard-gate
     4. Conversation intelligence (intent/referent/emotion)
     5. Gemini provider (NLU + natural reply; optional Google Search)
     6. Reply mismatch retry (1×)
     7. Response quality validator + bounded repair (RC6 NEW)
     8. Fake-booking claim block
     9. Respect finalize + handoff token
 → WhatsApp outbound
```

**Authoritative layers:** catalogue / pricing / availability / book_appointment tools.  
**Gemini role:** understanding + natural language — not price/booking truth.

**Prod reality:** Live T28 is **`phase6_t28_rc4`**, not RC3 as the brief states. RC5/RC6 remain local.

---

## 2. Root-cause map (pre-RC6 failures)

| Symptom | Cause | Layer |
|---------|-------|-------|
| Secondary questions dropped | Single-intent routing / Gemini incomplete | NLU + no completeness gate |
| “eka” lost meaning | Weak referent resolution | CI (partially fixed RC5) |
| Fake “lock in” | Pause → Gemini invent | Booking SM + prompt (RC4) |
| Robot tone | Template-heavy safety copy | Prompt (RC4/RC5) |
| Multi-price incomplete | Single resolve_price | pricing_resolver multi (RC4) |
| Old booking state overrides new ask | SM without pause | Phase2 pause (existing) |
| No pre-send completeness check | Missing validator | **RC6 adds** |

---

## 3. Proposed architecture (RC6)

1. **Understanding:** CI referent/emotion + ask-unit decomposition  
2. **Reasoning:** Gemini with structured CONVERSATION CONTEXT  
3. **Retrieval:** live catalogue + KB + branches (verified)  
4. **Validation:** `response_quality.validate_customer_reply` before send  
5. **Repair:** one bounded Gemini rewrite if units missing  
6. **Execution:** booking/pricing tools only for mutations  

No DB schema changes.

---

## 4. Implementation plan (done locally)

| Step | Status |
|------|--------|
| Audit pipeline | Done |
| `response_quality.py` | Done |
| Wire validator + repair in `main.py` | Done |
| NLU: cheaper / reject-prior / hodada | Done |
| Memory correction replace | Done |
| Tests | Done |
| Package RC6 | Done |
| Live Gemini API eval | **Pending staging key approval** |
| Deploy / WA | **STOPPED** |

---

## 5. Changed files

- `ai_engine/app/response_quality.py` **(NEW)**
- `ai_engine/app/conversation_intelligence.py`
- `ai_engine/app/main.py`
- `ai_engine/app/pricing_resolver.py` (carried)
- `ai_engine/app/booking_flow.py` (carried)
- `backend/services/crmHandoffInboundPolicy.js` (carried)
- `ai_engine/tests/test_response_quality_validator.py` **(NEW)**
- `ai_engine/tests/test_human_understanding_engine.py`

## 6. Database changes

**None.**

---

## 7. Regression tests

```
28 passed — response_quality + human_understanding + multi_question_price
```

Additional suites from prior RCs remain green when run separately (ude/heya/slot/phase6 quality).

---

## 8. Actual Gemini evaluation results

| Mode | Result |
|------|--------|
| Deterministic ask-unit + completeness fixtures | PASS |
| Live Gemini API (staging key) | **NOT RUN** — requires separate secure staging key + approval; secrets never logged |
| Live WhatsApp | **NOT SENT** |

Per brief §15: do not declare full success on unit tests alone for Gemini naturalness — **staging Gemini eval is the remaining gate**.

---

## 9. Before / after (realistic)

**Before:**  
Customer: “Butterfly kiyada? Layer thiyenawada? Kandy branch eka koheda?”  
AI: answers only Butterfly price → secondary asks dropped.

**After (RC6):**  
Ask units detected → if reply misses location/layer, `response_quality` fails → one repair rewrite → completeness checked again.

**Sales soft:**  
“ganan wadi” / “mita wada adu ekak” → `INTENT_ALTERNATIVE` + verified options, no invented discount.  
“balamu” → hesitation emotion, no pressure.

---

## 10. Performance & cost

| Item | Note |
|------|------|
| Extra latency | +0–1 Gemini repair only when incomplete (bounded) |
| Token cost | +1 completion max per incomplete turn |
| Provider timeout | Existing 8s lite / search / vision timeouts unchanged |
| Monitoring | `response_quality` / `response_quality_repair` actions in turn meta |

Exact prod p50/p95 not measured in this local pass (no prod restart).

---

## 11. Security & tenant isolation

- Tools still scoped by `tenantId` on every call.
- No cross-tenant memory merge.
- Pricing/booking validation not bypassed.
- No API keys in reports/logs.
- No customer data mutation in this local work.

---

## 12–13. Manifest & checksums

- `_release/phase6_t28_rc6/MANIFEST.json`
- `_release/phase6_t28_rc6/SHA256SUMS.txt`
- `_release/phase6_t28_rc6/DEPLOY_ORDER.txt` (HOLD)

---

## 14. Rollback plan

1. Do not deploy RC6 until approved.  
2. If deployed: restore docker files from `/root/xanesalon/_rollback/phase6_rc*` snapshot taken at deploy time.  
3. Restart `ai_engine`, `ai_crm_worker`, `backend`.  
4. Keep `_release/phase6_t28_rc4` and `rc5` folders intact.

---

## 15. Production readiness

| Gate | Status |
|------|--------|
| Local package | READY |
| Deterministic QA | PASS |
| Live Gemini staging eval | **PENDING** |
| Deploy approval | **REQUIRED** |
| WhatsApp approval | **REQUIRED** |

### STOP

Local implementation, QA, and reports complete.  
**Await explicit approval** before deployment or live WhatsApp testing.
