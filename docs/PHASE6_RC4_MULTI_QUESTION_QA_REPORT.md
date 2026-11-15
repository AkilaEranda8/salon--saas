# Phase 6 RC4 — Multi-Question Completeness QA

**Candidate:** `phase6_t28_rc4`  
**Parent:** `phase6_t28_rc3` (production — **unchanged**)  
**Status:** LOCAL PASS — **NOT DEPLOYED**

## Also included (live WA bugs)

| Bug | Fix |
|-----|-----|
| `mama keewe time aka price aka newei` → AI still asked which price | `is_price_rejection` blocks price hard-gate |
| `Check history` → soft-bump only while queued | handoff assist + correction detect |
| Haircut booking while queued → risk of soft-bump | `QUEUED_BOOKING_RE` assist |
| `Ude 9 ta damu` → Gemini said "time fix kala" but **no DB appointment** | `_parse_time` + clear-step for `ude 9`; no booking SM pause; ban fake fix claims |

## Changed files

| File | Change |
|------|--------|
| `ai_engine/app/pricing_resolver.py` | multi-ask assembly + price-rejection |
| `ai_engine/app/main.py` | skip hard-gate on rejection; multi list metadata |
| `ai_engine/app/booking_flow.py` | correction: newei / check history / keewe |
| `backend/services/crmHandoffInboundPolicy.js` | queued assist for history + booking |
| tests | multi-question + price-rejection + handoff |

## Test results

| Suite | Result |
|-------|--------|
| `test_multi_question_price_completeness.py` | PASS |
| Related (`keratin\|pricing\|phase6\|multi_question\|butterfly\|facial\|respect\|gemini_price`) | **295 passed** |
| Import smoke (RC package) | PASS |

## Brief regression coverage

| Requirement | Covered |
|-------------|---------|
| Hair Cut + Butterfly + Layer + duration | yes |
| Normal + Hydra prices | yes |
| Multiple facial IDs/prices | yes |
| 3+ questions one message | yes |
| SI / Singlish / EN | yes |
| No invented service/price | yes |
| No missing secondary answer | yes |
| No duplicate outbound (unchanged path) | N/A local unit — WA retest after deploy approval |

## Before / after

### Hair (Singlish)

**Before:** `Ladies Hair Cut-Butterfly: Rs 4,500 · 105 min.`

**After:**
```
Oyage question eke each part walata verified answers:
• Ladies Hair Cut-Butterfly: Rs 4,500 · 105 min
• Layer Cut: separate catalogue service ekak widiyata list wela naha — stylist kenekgen price/availability confirm karaganna puluwan.
• Ladies Hair Cut: Rs 3,500 · 45 min
• Gents Hair Cut: Rs 2,000 · 45 min
```

### Facial (Singlish)

**Before:** `Normal Facial: Rs 4,500 · 90 min.`

**After:** Normal + Jovis + Oxy + all distinct Hydra rows with live prices (6k / 8k / 10k / 14k).

## Package

- `_release/phase6_t28_rc4/MANIFEST.json`
- `_release/phase6_t28_rc4/SHA256SUMS.txt`
- `_release/phase6_t28_rc4/DEPLOY_ORDER.txt`

## Production recommendation

**HOLD.** Deploy `phase6_t28_rc4` only after explicit approval (ai_engine files + restart). Then re-run live WA smoke on test number only.
