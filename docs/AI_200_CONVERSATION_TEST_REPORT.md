# AI 200+ Conversation Test Report — Phase 2+

**Date:** 2026-11-14  
**File:** `ai_engine/tests/test_phase2_plus_200_conversations.py`

## Volume

| Metric | Value |
|---|---:|
| Collected tests in Phase 2+ file | **244** |
| Combined with prior suites (full local run) | **359 passed** |

## Coverage map

| Category | Examples |
|---|---|
| Intent matrix | 100+ EN/Singlish/SI price, book, cancel, correction, image, hours, branch |
| Topic switch | keratin↔facial, haircut↔bridal, aliases |
| Multi-turn pause scripts | per-service price mid-`await_date` + continue |
| Correction / image / resume / cancel | named multi-turn tests |
| Emotion / objection | expensive, urgency, confusion |
| Context builds | every message builds CI + prompt block |
| Pricing safety | no invent |
| Script detection | EN / Singlish / SI |
| Tenant field | tenant_id threaded on context |
| Screenshot failures (Phase 1) | photo, ahana, keratin, details-before-book, pause override |

## How to run

```bash
cd ai_engine
python -m pytest tests/test_phase2_plus_200_conversations.py -q
```
