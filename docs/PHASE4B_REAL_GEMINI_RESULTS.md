# Phase 4B — Real Gemini Results (Larvendo T28)

**Date:** 2026-11-14  
**Gate status:** **BLOCKED**  
**Evidence:** `_scripts/_phase4_real_gemini.json`

## Credential check

| Source | Status |
|---|---|
| `.env.gemini.local` | **Absent** |
| Process `GEMINI_API_KEY` / `AI_ENGINE_GEMINI_KEY` / `GOOGLE_API_KEY` | **Absent** |
| Production secret retrieval | **Not attempted** (forbidden) |
| Gitignore | `.env.*.local` + explicit `.env.gemini.local` / `.env.gemini.staging` |

Harness output (sanitized):

```json
{
  "ran": false,
  "pass": false,
  "blocker": "No authorized local/staging Gemini key...",
  "det_pass": true
}
```

## Real-provider scenarios

**Not executed.** Per Phase 4B rules: do not simulate a real Gemini pass when the key is unavailable.

| Scenario | Result |
|---|---|
| Sinhala / Singlish / English | BLOCKED |
| Butterfly ID 278 / Rs 4500 (live model ask) | BLOCKED |
| Galaxy clarification (live model) | BLOCKED |
| Bra Strap + memory (live model) | BLOCKED |
| Latest-ask / topic switch / image / pause / cancel / timeout | BLOCKED |

## Deterministic companion (not Gemini)

These ran inside the same harness and **must not be counted as real Gemini**:

| Check | Provider | Result |
|---|---|---|
| Butterfly → id 278 / Rs 4500 | `pricing_resolver` | PASS |
| Galaxy → no amount | `pricing_resolver` | PASS |
| Bra Strap + `pricing_service_key=keratin` → Rs 30000 | `pricing_resolver` | PASS |

## How to unblock

1. Place an **authorized staging/local** key only:

```text
# e:\salon_v1\.env.gemini.local
GEMINI_API_KEY=...
```

2. Run: `python _scripts/_phase4_real_gemini.py`  
3. Attach updated `_phase4_real_gemini.json` with `ran: true` and scenario passes.  
4. Update this report — only then can the Gemini gate move from BLOCKED to PASS.

## Explicit non-claims

- Real Gemini was **not** passed.  
- Stub/independent QA relevance scores are **not** a substitute.  
- No API keys were printed or logged.
