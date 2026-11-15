# Regression Test Report — Phase 2+

**Date:** 2026-11-14 · **Local only**

## Results

| Suite | Result |
|---|---|
| All ai_engine pytest (pricing + booking + P0 + Phase2+) | **359 / 359 PASS** |
| Behaviour harness (`_scripts/_qa_behaviour_local.py`) | **17 / 17 PASS** |
| Phase 2+ conversation file | **244 collected, all pass** |

## Non-regression commitments met

- Prior 115+ tests still green (expanded to 359 with new suite).  
- Behaviour 17/17 unchanged.  
- Pricing resolver behaviour unchanged.  
- P0 pause/cancel/media/correction tests still pass.

## Command

```bash
cd ai_engine
python -m pytest tests/ -q
python ../_scripts/_qa_behaviour_local.py
```
