# Phase 6 RC7 — Advanced Autonomous Intelligence Upgrade

**Tenant:** 28 – Larvendo Salon  
**Candidate:** `phase6_t28_rc7`  
**Parent:** `phase6_t28_rc6` (immutable)  
**Status:** **LOCAL ONLY — NOT DEPLOYED**  
**WhatsApp:** NOT SENT  
**Commit/push:** NOT DONE  
**Date (UTC):** 2026-11-15  

---

## 1. Architecture audit summary

RC7 evolves the RC6 pipeline. Memory, validation, and booking/pricing tools were **extended in place** — not duplicated. New modules: `turn_planner.py`, `turn_trace.py`.

Full audit: `docs/PHASE6_RC7_ARCHITECTURE_AUDIT.md`

---

## 2. Root-cause map (pre-RC7)

| Symptom | Cause | Fix layer |
|---------|-------|-----------|
| Secondary asks dropped | Completeness only soft | Quality + planner ask units |
| Stale keratin after facial switch | Memory topic wins | `apply_stale_context_guard` |
| `memory_correction` lost | CRM upsert ignored tool | `crmAiMemoryService` merge |
| Fake media understanding | No media-claim gate | `response_quality` |
| No correlation across layers | Actions only | `turn_trace` |
| Unbounded “AI agent” risk | No planner bounds | `MAX_TOOL_STEPS=4`, 9 fixed steps |

---

## 3. Implementation by phase

### Phase 1 — Deep understanding
- Incomplete utterance detection (`eka`, `hari`, trailing fragments)
- Implicit slot/visit requests (`free da`, `heta enna`)
- Broader correction patterns (`i meant`, `naha … eka`)
- Stale-context guard on topic switch

### Phase 2 — Advanced memory
- `conversation_summary`, `pending_questions`, `commitments`, `correction_log`
- `merge_memory_correction` now persisted via CRM upsert
- `scrub_sensitive_memory` + JS privacy key scrub
- Tenant id carried in patch; phone still keyed per tenant in CRM

### Phase 3–4 — Planning & tools
- `build_turn_plan` → 9 steps, selects **existing** `TOOLS` only
- Consequential tools flag `require_customer_confirm`
- Plan injected as internal prompt block (never customer-facing)

### Phase 5 — CX
- Empathy / incomplete / implicit / stale rules appended to decision
- Respect + Singlish matching retained from RC4–RC6

### Phase 6 — Multimodal
- Quality gate: never claim photo/voice processed when `has_media=False`
- Health diagnosis forbidden in replies
- Existing vision/transcribe paths unchanged

### Phase 7 — Quality
- Added: language mismatch, repetition, media claim, tool-failure ack, context drift, price identity, health ban
- Repair still **1 attempt**; hint forbids inventing facts

### Phase 8 — Observability
- `trace_id` (`t28-…`), redacted phone, event spans, Gemini usage fields
- Secrets stripped from trace detail

### Phase 9 — Evaluation
- Offline: **10/10** (`_scripts/_eval_rc7_results.json`)
- Live Gemini (local key, no WA): **6/6** provider responses
- Note: raw live probe has no catalogue/tools — full-turn safety remains pricing + quality gates. Staging WA eval still needs separate approval.

### Phase 10 — Release
- Bundle: `_release/phase6_t28_rc7/`
- Prior RC folders preserved
- STOP — await deploy approval

---

## 4. Changed files

| File | Change |
|------|--------|
| `ai_engine/app/turn_planner.py` | **NEW** |
| `ai_engine/app/turn_trace.py` | **NEW** |
| `ai_engine/app/response_quality.py` | RC7 validators |
| `ai_engine/app/conversation_intelligence.py` | Memory + NLU upgrades |
| `ai_engine/app/booking_flow.py` | Correction patterns |
| `ai_engine/app/main.py` | Wire planner + trace + quality |
| `backend/services/crmAiMemoryService.js` | Correction merge + RC7 meta |
| `ai_engine/tests/test_rc7_autonomous_intelligence.py` | **NEW** |
| `ai_engine/tests/test_response_quality_validator.py` | Extended |
| `_scripts/_eval_rc7_gemini.py` | Eval harness |
| `_scripts/_package_phase6_rc7.py` | Packager |

---

## 5. Test results

```
pytest test_rc7_autonomous_intelligence.py test_response_quality_validator.py
→ 13 passed

offline eval → 10/10
live Gemini  → 6/6 (latency ~1.4–2.0s; model gemini-3.5-flash-lite)
import smoke (package) → ok
```

---

## 6. Security evidence

- No API keys in traces / memory patches  
- Phone redacted to last-4 in `turn_trace`  
- Sensitive key scrub (api_key/password/card/nic/otp) in Python + JS  
- Consequential tools still require booking_flow confirmation  
- No prod mutations; no WA sends  

---

## 7. Manifest / checksums / rollback

- Manifest: `_release/phase6_t28_rc7/MANIFEST.json`  
- Checksums: `_release/phase6_t28_rc7/SHA256SUMS.txt`  
- Deploy order (HOLD): `_release/phase6_t28_rc7/DEPLOY_ORDER.txt`  
- Rollback: restore prior docker snapshot under `/root/xanesalon/_rollback/` (when a deploy is later approved)

---

## 8. STOP

Local implementation + QA complete.  
**Waiting for separate approval** before staging live WA evaluation, production deploy, or commit/push.
