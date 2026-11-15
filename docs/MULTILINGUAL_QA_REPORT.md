# Multilingual QA Report — Phase 2+

**Date:** 2026-11-14 · **Local only**

## Support

| Mode | Detection | Persistence |
|---|---|---|
| English | latin, non-Singlish | script_mode=english |
| Singlish | Latin + Singlish lexicon | sticky in SM + memory |
| Sinhala Unicode | Sinhala codepoints | script_mode=sinhala |
| Mixed | update_script_mode sticky | CI prompt style line |

## Behaviours tested

- Price asks in EN / Singlish / SI  
- Correction Singlish (`Ahana deta nemei…`)  
- Always-reply / soft correction uses Singlish-aware text (not forced Unicode welcome)  
- Behaviour harness 17/17 includes SI/Singlish/EN intents

## Known residual

- Gemini can still emit rare Unicode glitches; sanitize remains best-effort.  
- Full corrupted-glyph fuzzer not in this phase.
