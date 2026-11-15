# RC2 — Operator Final Checklist

**Project:** Larvendo Salon AI  
**Tenant:** 28  
**Release:** `_release/phase4c_t28_rc2/`  
**Decision:** **HOLD**  
**Date:** 2026-11-14  

Use with: `RC2_FINAL_APPROVAL_STATUS.md`, `RC2_PRODUCTION_SNAPSHOT_CHECKLIST.md`, `RC2_KEY_ROTATION_AND_STORAGE_CHECKLIST.md`.

## A. Release integrity

| # | Item | Owner | Status |
|---|---|---|---|
| A1 | RC2 MANIFEST ↔ file SHA-256 | Local verify script | VERIFIED |
| A2 | RC2 SHA256SUMS | Local verify script | VERIFIED |
| A3 | RC1 untouched (manifest self-check) | Local verify script | VERIFIED |
| A4 | RC2 bundle not modified this prep | Policy | VERIFIED |
| A5 | Deploy only from RC2 path | Plan | VERIFIED (documented) |

## B. Secrets / Gemini staging key

| # | Item | Owner | Status |
|---|---|---|---|
| B1 | Identify exposed chat key as compromised | Operator | OPERATOR ACTION REQUIRED |
| B2 | Revoke via Google AI Studio (staging) | Operator | OPERATOR ACTION REQUIRED |
| B3 | Generate replacement staging key | Operator | OPERATOR ACTION REQUIRED |
| B4 | Store only in `.env.gemini.local` / vault | Operator | OPERATOR ACTION REQUIRED |
| B5 | `.env.gemini.local` gitignored | Workspace | VERIFIED |
| B6 | No API key in `_release/**` | Workspace scan | VERIFIED |
| B7 | No secret values in RC2 reports | Workspace | VERIFIED (placeholders only) |
| B8 | Never print secret | Policy | VERIFIED (documented) |

## C. Production snapshot (pre-deploy)

| # | Item | Owner | Status |
|---|---|---|---|
| C1 | Snapshot checklist prepared | Docs | VERIFIED |
| C2 | Execute app/JS/hash snapshot on server | Operator | NOT AUTHORIZED |
| C3 | DB backup | Operator | NOT AUTHORIZED |
| C4 | Env/config backup (secure) | Operator | NOT AUTHORIZED |
| C5 | Nginx/process config backup | Operator | NOT AUTHORIZED |
| C6 | Snapshot verify + restore dry-run notes | Operator | NOT AUTHORIZED |

## D. Deployment plan

| # | Item | Owner | Status |
|---|---|---|---|
| D1 | Order: CREATE resolvers → REPLACE main/booking → health → JS both sides | Review | VERIFIED |
| D2 | Python deps: `main` imports `pricing_resolver` (+ CI/booking) | Review | VERIFIED |
| D3 | Backend + worker same JS pair | Review | VERIFIED |
| D4 | Health-check after ai_engine restart | Review | VERIFIED |
| D5 | DB compatibility (no migrations) | Review | VERIFIED |
| D6 | Rollback sequence documented | Review | VERIFIED |
| D7 | Post-deploy hash vs SHA256SUMS | Review | VERIFIED |
| D8 | Execute deploy | Operator | NOT AUTHORIZED / HOLD |

## E. WhatsApp smoke

| # | Item | Owner | Status |
|---|---|---|---|
| E1 | Plan covers SI / SG / EN | Docs | VERIFIED |
| E2 | Keratin Shoulder Rs 25,000 | Docs | VERIFIED |
| E3 | Galaxy clarify / no invent | Docs | VERIFIED |
| E4 | Butterfly verified price | Docs | VERIFIED |
| E5 | Image / pause / topic switch | Docs | VERIFIED |
| E6 | Booking / cancel / handoff | Docs | VERIFIED |
| E7 | Duplicate-message prevention row | Docs | VERIFIED |
| E8 | Send messages | Operator | NOT AUTHORIZED |

## F. Go / no-go

| # | Item | Status |
|---|---|---|
| F1 | Explicit deploy approval | BLOCKED (HOLD) |
| F2 | Explicit WA smoke authorization | BLOCKED |
| F3 | Key rotation complete | BLOCKED until B2–B4 done |
| F4 | Prod snapshot executed | BLOCKED until approved deploy window |

**Final:** Remain on **HOLD** until operator completes B2–B4, snapshot at deploy time, and separate explicit deploy approval.
