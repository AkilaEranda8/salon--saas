# Pricing Accuracy Report — Before / After

**Date:** 2026-11-14 · Local resolver + official catalogue fixtures

## Before (pre-resolver)

| Ask | Old behaviour risk |
|---|---|
| Keratin without length | LLM might quote a single number |
| Ladies Hair Cut via Google KB | **75 min** incorrect |
| Live vs official conflict | Soft prompt only |
| Unknown service | Possible invent |

## After (local resolver + KB body fix)

| Case | Expected | Result |
|---|---|---|
| Keratin no length | Ask Shoulder/Bra Strap/Hip | ✅ |
| Keratin shoulder | Rs 25,000 / 300 | ✅ |
| Keratin bra strap | Rs 30,000 / 300 | ✅ |
| Keratin hip | Rs 40,000 / 360 | ✅ |
| Botox hip | Rs 32,000 / 360 | ✅ |
| Highlights shoulder | Rs 15,000 / 300 | ✅ |
| Ladies Hair Cut | Rs 3,500 / **45** | ✅ |
| Live duration 75 vs official 45 | conflict + escalate | ✅ |
| Unknown “quantum plasma facial” | no price invent | ✅ |
| Singlish `Keratin ekak kiyada?` | needs_length | ✅ |

## KB #27/#28 after correction

| ID | Ladies Hair Cut line |
|---:|---|
| 27 | `Ladies Hair Cut — 45 min · LKR 3500.00` |
| 28 | `Ladies Hair Cut — 45 min · LKR 3500.00` |

Evidence: `_scripts/_kb_27_28_duration_fix.json`

## Production note

Resolver code is **local only** until ai_engine deploy approval. KB text fix is live in DB for T28.
