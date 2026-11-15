# Phase 3 — Real Gemini Test Report (Larvendo T28)

**Date:** 2026-11-14  
**Mode:** Local validation only — no deploy / restart / commit / push / WA blast  
**Evidence:** `_scripts/_phase3_validation.json` → `real_gemini`

## Distinction: stub vs real

| Suite | Provider | Status |
|---|---|---|
| Pytest / behaviour / independent QA free-form | **Stub** `CaptureProvider` or deterministic SM/pricing | Executed |
| `tests/test_real_gemini_optional.py` | **Real Gemini** if env key set | **Skipped** (no key) |
| Phase 3 `section_real_gemini` | **Real Gemini** if `GEMINI_API_KEY` / `AI_ENGINE_GEMINI_KEY` / `GOOGLE_API_KEY` | **Not run** |

## Result

**Real Gemini conversation tests: NOT EXECUTED**

Reason: No Gemini API key available in the local process environment. Local backend/ai_engine were down; extracting tenant secrets from production was blocked by credential-safety policy (correctly — keys must not be pulled into agent logs).

### Planned scenarios (not run)

| ID | Intent |
|---|---|
| en_service | English service ask |
| si_greeting | Sinhala Keratin ask |
| sg_price_style | Singlish price + length |
| en_correction | Correction handling |
| en_human | Human / staff request |
| sg_before_book | Details before book |
| image_vision | Multimodal image turn |

## Safety

- No API keys printed or stored in reports.
- No customer PII used.
- No real WhatsApp messages sent.

## Condition to clear

Provide a **local** `GEMINI_API_KEY` (or start local backend so `/crm/internal/ai-settings/28` can resolve the tenant key into the ai_engine process) and re-run:

```text
python _scripts/_phase3_validation.py
```

Until then, live NLU quality remains an open deploy gate (stub scores ≠ live Gemini).
