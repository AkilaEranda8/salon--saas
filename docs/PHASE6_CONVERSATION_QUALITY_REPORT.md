# Phase 6 — Conversation Quality Report (Larvendo T28)

**Tenant:** 28 – Salon Larvendo  
**Candidate RC:** `phase6_t28_rc3`  
**Status:** LOCAL ONLY — **NOT DEPLOYED**  
**Date (UTC):** 2026-11-14  

## Scope

Production conversation quality improvements for Hair Cut style resolution, Facial catalogue display, location truthfulness, handoff claim accuracy, multi-question replies, and Sir/Madam tone — without mutating production RC2 / phase4c immutable releases.

## Evidence (read-only live T28)

| Item | Live result |
|------|-------------|
| Butterfly | Service **id 278** `Ladies Hair Cut-Butterfly` — **Rs 4,500** / **105 min** / active |
| Layer Cut | **Not present** as a separate active Hair Cut row |
| Branch | **Larvendo Kandy** — `254, William Gopallawa Mawatha,Kandy` — phone `0812235955` — status active — lat/lng present |
| Opening hours on Branch | **Not stored** on branch record |
| Facials | Multiple active rows across `Facials` and `Facials (Ladies and Gents)` with distinct ids/prices |

No WhatsApp screenshots were present in the workspace; findings used the Phase 6 brief + live catalogue/branch probe (`_scripts/_diag_phase6_catalogue_branches.py`, mutated=false).

## Issues → fixes

### A — Hair Cut / Layer / Butterfly
- Multi-style resolver (`catalogue_quality.resolve_haircut_styles`) returns **all** matched styles in one ask.
- Butterfly quotes **only** the Butterfly live row (id 278 / Rs 4,500).
- Layer missing → clarify + stylist confirmation; **never** substitute Ladies Hair Cut Rs 3,500.

### B — Facial catalogue
- Display helper keeps **distinct ids**; near-duplicate groups are labeled for the model.
- **No merge / delete / deactivate** performed.

### C — Handoff claims
- Soft handoff copy changed from “already notified/delivered” to **request in progress**.
- Queue ack text used only after conversation is already queued.
- Pending-handoff FAQ assist retained; generic ack spam not reintroduced.

### D — Location
- Snapshot emits **verified-only** branch fields + Google Maps from lat/lng.
- Hours: if absent on branch → explicit “NOT IN BRANCH RECORD — do not invent”.

### E — Sir/Madam
- Preference respected; **no gender inference**; `Aniwa` banned; honorific only when appropriate (not robotic every turn).

### Multi-question
- `_understand_customer_ask` builds a combined `multi_question` must covering all detected topics.

## Acceptance mapping

| Criterion | Result |
|-----------|--------|
| Every question answered | Prompt + multi-intent must |
| No unrelated category | Existing category gate + style filter |
| No wrong price substitution | Butterfly/Layer pricing paths |
| No unverified location | Verified branch formatter |
| No false handoff confirmation | Request wording |
| No lost messages | Prior silent-reply policy retained |
| Sir/Madam professional | customer_respect |
| Keratin protection intact | 282 related tests passed |
| Booking/cancel functional | Untouched flow; import smoke OK |
| T28 isolation | Tenant-scoped tools unchanged |

## Boundaries respected

- No production deploy / restart  
- No live WhatsApp  
- No customer data writes  
- No commit / push  
- phase4c_t28_rc2…rc5 folders untouched  

## Stop

Awaiting review / deploy approval for `phase6_t28_rc3`.
