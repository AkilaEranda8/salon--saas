# Phase 4 — Real Gemini Validation Report (Larvendo T28)

**Date:** 2026-11-14  
**Mode:** Local/staging key only — **no production secret retrieval**  
**Harness:** `_scripts/_phase4_real_gemini.py`  
**Evidence:** `_scripts/_phase4_real_gemini.json`

## Stub vs real

| Layer | Type | Result |
|---|---|---|
| Pytest / behaviour / independent QA free-form | Stub / deterministic | Still green (481 / 17/17 / 12/12) |
| Pricing Butterfly / galaxy / Bra Strap | **Deterministic resolver** | **PASS** (recorded in Phase 4 harness) |
| Live Gemini SI/EN/Singlish/image/correction | **Real Gemini** | **NOT RUN** |

## Real Gemini execution status

**NOT EXECUTED — blocked on authorized key**

Authorized sources checked (none present):

1. Process env `GEMINI_API_KEY` / `AI_ENGINE_GEMINI_KEY` / `GOOGLE_API_KEY`
2. File `e:\salon_v1\.env.gemini.local` (matched by `.gitignore` pattern `.env.*.local`)

Production credentials were **not** pulled (policy + explicit Phase 4 rule).

### How to authorize and re-run

Create `e:\salon_v1\.env.gemini.local`:

```text
GEMINI_API_KEY=your_staging_or_local_key_here
```

Then:

```text
python _scripts/_phase4_real_gemini.py
```

### Planned real scenarios (pending key)

| ID | Request theme | Expected |
|---|---|---|
| si_service | Sinhala Keratin info | On-topic SI/SG; no invent |
| sg_price | Keratin + shoulder | Length/price guidance; no galaxy invent |
| en_service | Facials | On-topic |
| en_unknown | Galaxy Plasma | No Keratin 25k |
| en_butterfly_ask | Butterfly cut | Prefer 4500 / not 3500 (resolver is source of truth for quotes) |
| sg_length_followup | Bra Strap | Ask service or use context |
| en_correction | Wrong reply correction | Re-answer; no say-book |
| sg_topic_switch | Waxing during book | Answer waxing; don’t force date |
| en_human | Staff | Handoff language |
| sg_before_book | Details before book | Details first |
| image_inquiry | Photo | Non-empty vision reply |
| provider_recovery_basic | Ping | Ok or handled error |

## Deterministic companion results (this run)

| ID | Pass |
|---|---|
| Ladies Hair Cut-Butterfly → id 278 / Rs 4500 | **YES** |
| Galaxy Plasma → no amount | **YES** |
| Bra Strap + keratin memory → Rs 30000 | **YES** |

## Acceptance vs this report

| Criterion | Status |
|---|---|
| Real Gemini scenarios pass | **FAIL / PENDING** (not run) |
| No false pricing quotes (resolver) | **PASS** |

## Severity

**High (deploy condition):** Live Gemini quality unverified for this package.
