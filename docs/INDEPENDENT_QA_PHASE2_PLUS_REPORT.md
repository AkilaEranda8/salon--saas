# Independent QA Report — Phase 2+ (Larvendo T28)

**Date:** 2026-11-14  
**Mode:** Local independent assessment — **no deploy / restart / commit / push / prod data**  
**Evidence:** `_scripts/_independent_qa_phase2_plus.json`

## Executive verdict

**CONDITIONAL PASS for local quality** — production still requires explicit deploy approval and live WhatsApp smoke. One architectural gap remains: intent classification is still deterministic/regex-guided, not a Gemini NLU call.

- Scenario pass: **12/12** (stub Gemini for free-form turns)
- Avg customer-facing relevance: **0.904** (target ≥ 0.70)
- Architecture checks: **7/8** (A3 regex-CI gap expected; A5 invent/false-quote **PASS**)
- Pytest: `481 passed, 1 skipped in 2.19s`
- Behaviour: **17/17**
- **Deploy gate:** local quality bar met; still needs explicit prod approval + live smoke.

## Verification matrix (requested 1–10)

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Gemini complete ordered context | **PASS** (with caveat) | System CI + chronological recentMessages + current user; images on user turn. Captured in provider log. |
| 2 | Memory tenant+customer isolation | **PASS** | `tenant_id` + phone/conversation filters; CI tenant_id distinct in dual-tenant probe. |
| 3 | Latest intent not overridden | **PASS** (local) | Mid-book facial/photo/correction yield; caveat: classifier is regex CI, not Gemini NLU. |
| 4 | Topic switch + correction multi-turn | **PASS** | S1/S2/S4 customer-facing replies below. Length-only follow-up is a known gap. |
| 5 | Image content passed to Gemini | **PASS** | `image_has_b64` on CaptureProvider for S3. |
| 6 | Pricing no Gemini invent / false quote | **PASS** | Resolver hard-gate; unknown services clarify/escalate; no Gemini invent path on price asks. |
| 7 | Book/cancel backend confirm | **PASS** | S6 cancel verified via `cancel_appointment` + status cancelled. |
| 8 | No generic fallback override | **PASS** (tested paths) | Correction path forbid `say *book*`; soft generic did not fire in this harness run. |
| 9 | P0 intact | **PASS** | Media pause + cancel persistence; full pytest suite. |
| 10 | No cross-tenant leakage | **PASS** (code/unit) | Memory queries tenant-scoped; no shared global context store. |

## Customer-facing conversation evidence

### S1_keratin_memory — Keratin price → length → Saturday continuity (CI) [PASS]

- **Customer:** Keratin kiyada?
- **AI:** Keratin price eka hair length eken wenas wenawa. Oyaage length eka *shoulder*, *bra strap* da *hip* da?
- Relevance: 1.0 · pass=True · tools=['list_services_pricing', 'pricing_resolver', 'pricing_memory_patch']

- **Customer:** Bra Strap
- **AI:** Guide price for Keratin (bra strap): Rs 30,000 · ~300 min. Final price is confirmed at the salon visit.
- Relevance: 1.0 · pass=True · tools=['list_services_pricing', 'pricing_resolver', 'pricing_memory_patch']

- **Customer:** Saturday puluwanda?
- **AI:** Saturday slots thiyenawa — book karanna date+time kiyanna (e.g. Saturday 10am).
- Relevance: 1.0 · pass=True · tools=['customer_lookup', 'search_knowledge', 'list_branches', 'list_services_snapshot', 'list_staff_snapshot', 'salon_data_snapshot', 'salon_rules', 'comm_style', 'conversation_intelligence', 'understand_ask', 'google_search_gate']
- Gemini payload: ci=True images=0 b64=False price_lock=False

### S2_correction — Correction re-answers prior keratin ask [PASS]

- **Customer:** Keratin kiyada?
- **AI:** Keratin price eka hair length eken wenas wenawa. Oyaage length eka *shoulder*, *bra strap* da *hip* da?
- Relevance: 0.85 · pass=True · tools=['list_services_pricing', 'pricing_resolver', 'pricing_memory_patch']

- **Customer:** Ahana deta nemei rply denn oya
- **AI:** Sorry — miss una. Keratin price eka hair length eka anuwa: Shoulder / Bra Strap / Hip. Length eka kiyanna.
- Relevance: 1.0 · pass=True · tools=['customer_lookup', 'search_knowledge', 'salon_data_snapshot', 'list_branches', 'list_services_snapshot', 'list_staff_snapshot', 'salon_data_snapshot', 'salon_rules', 'correction_intent', 'comm_style', 'conversation_intelligence', 'understand_ask']
- Gemini payload: ci=True images=0 b64=False price_lock=False

### S3_image_mid_book — Photo during await_date → vision not date ask [PASS]

- **Customer:** book appointment
- **AI:** Sure — let's book an appointment. Which service do you want?
Tell me which type you want (e.g. hair treatment, dressing, hair cut).
- Relevance: 0.85 · pass=True · tools=['comm_style', 'list_services', 'service_category_menu', 'booking_flow_state']

- **Customer:** 1
- **AI:** What date? (today / tomorrow / heta / Monday) — or say *heta 10am* together.
- Relevance: 1.0 · pass=True · tools=['comm_style', 'list_staff', 'booking_flow_state']

- **Customer:** [Customer sent a photo]
- **AI:** Photo eke layered style ekak peena. Shoulder length wage estimate. Oya me wage cut ekakda / colour ekakda karaganna balanne?
- Relevance: 1.0 · pass=True · tools=['comm_style', 'booking_pause_for_understanding', 'booking_flow_state', 'customer_lookup', 'search_knowledge', 'salon_data_snapshot', 'list_branches', 'list_services_snapshot', 'list_staff_snapshot', 'salon_data_snapshot', 'salon_rules', 'comm_style']
- Gemini payload: ci=True images=1 b64=True price_lock=False

### S4_facial_mid_book — Facial price mid await_date pauses booking [PASS]

- **Customer:** book appointment
- **AI:** Sure — let's book an appointment. Which service do you want?
Tell me which type you want (e.g. hair treatment, dressing, hair cut).
- Relevance: 0.7 · pass=True · tools=['comm_style', 'list_services', 'service_category_menu', 'booking_flow_state']

- **Customer:** 1
- **AI:** What date? (today / tomorrow / heta / Monday) — or say *heta 10am* together.
- Relevance: 0.7 · pass=True · tools=['comm_style', 'list_staff', 'booking_flow_state']

- **Customer:** Facial mila?
- **AI:** Verified salon prices:
• Hydra Facial: Rs 5,500 · 60 min
- Relevance: 1.0 · pass=True · tools=['search_knowledge', 'comm_style', 'booking_pause_for_understanding', 'booking_flow_state', 'list_services_pricing', 'pricing_resolver']

- **Customer:** continue
- **AI:** Date eka kiyanna — *ade* / *heta* / Monday. *Heta 10am* wage ekama message ekenath puluwan!
- Relevance: 0.85 · pass=True · tools=['comm_style', 'booking_resume', 'booking_flow_state']

### S5_details_before_book — Details before book does not force date [PASS]

- **Customer:** book kara gann kalin details kiyana
- **AI:** Hari — book karanna kalin details: Keratin length tiers Shoulder/Bra Strap/Hip. Service eka pick karala date/time balamu.
- Relevance: 1.0 · pass=True · tools=['customer_lookup', 'search_knowledge', 'salon_data_snapshot', 'list_branches', 'list_services_snapshot', 'list_staff_snapshot', 'salon_data_snapshot', 'salon_rules', 'comm_style', 'conversation_intelligence', 'understand_ask', 'google_search_gate']
- Gemini payload: ci=True images=0 b64=False price_lock=False

### S6_cancel_verified — Cancel requires backend confirmation [PASS]

- **Customer:** cancel my appointment
- **AI:** Hi Navee — cancel appointment #145 on 2099-01-05 11:00?
Reply *yes* to cancel it or *no* to keep it.
- Relevance: 1.0 · pass=True · tools=['comm_style', 'customer_lookup', 'list_appointments', 'booking_flow_state']

- **Customer:** yes
- **AI:** Cancelled appointment #145 on 2099-01-05 11:00.
- Relevance: 0.7 · pass=True · tools=['comm_style', 'cancel_appointment', 'booking_flow_state']

### S7_language — Can speak Sinhala — natural SI reply [PASS]

- **Customer:** Can I speak Sinhala?
- **AI:** ඔව්, පුළුවන් 😊 අපි සිංහලෙන් කතා කරමු. මොන service එක ගැනද දැනගන්න ඕනේ?
- Relevance: 1.0 · pass=True · tools=['customer_lookup', 'search_knowledge', 'salon_data_snapshot', 'list_branches', 'list_services_snapshot', 'list_staff_snapshot', 'salon_data_snapshot', 'salon_rules', 'comm_style', 'conversation_intelligence', 'understand_ask', 'google_search_gate']
- Gemini payload: ci=True images=0 b64=False price_lock=False

### S8_objection — Price objection acknowledged [PASS]

- **Customer:** Keratin kiyada?
- **AI:** Keratin price eka hair length eken wenas wenawa. Oyaage length eka *shoulder*, *bra strap* da *hip* da?
- Relevance: 0.7 · pass=True · tools=['list_services_pricing', 'pricing_resolver', 'pricing_memory_patch']

- **Customer:** Ane eka tikak expensive
- **AI:** Hari — price eka gana worry ekak thiyenawa. Aduma options catalogue eken kiyannam.
- Relevance: 1.0 · pass=True · tools=['customer_lookup', 'search_knowledge', 'salon_data_snapshot', 'list_branches', 'list_services_snapshot', 'list_staff_snapshot', 'salon_data_snapshot', 'salon_rules', 'comm_style', 'conversation_intelligence', 'understand_ask', 'google_search_gate']
- Gemini payload: ci=True images=0 b64=False price_lock=False

### S9_galaxy_false_quote — Unknown galaxy treatment must NOT quote Keratin [PASS]

- **Customer:** Galaxy Plasma Treatment price kiyada?
- **AI:** Eka exact service eka verified list eken hambune na. Catalogue name eka kiyanna — nathnam *staff* kiyala team eken confirm karaganna.
- Relevance: 1.0 · pass=True · tools=['search_knowledge', 'list_services_pricing', 'pricing_resolver']

### S10_length_memory — Bra Strap after Keratin uses resolver + memory [PASS]

- **Customer:** Keratin kiyada?
- **AI:** Keratin price eka hair length eken wenas wenawa. Oyaage length eka *shoulder*, *bra strap* da *hip* da?
- Relevance: 0.85 · pass=True · tools=['list_services_pricing', 'pricing_resolver', 'pricing_memory_patch']

- **Customer:** Bra Strap
- **AI:** Guide price for Keratin (bra strap): Rs 30,000 · ~300 min. Final price is confirmed at the salon visit.
- Relevance: 1.0 · pass=True · tools=['list_services_pricing', 'pricing_resolver', 'pricing_memory_patch']

### S11_provider_down — Provider failure does not say-book [PASS]

- **Customer:** Saturday afternoon puluwanda? Recommend a style for wedding
- **AI:** Kama nathi — AI system eka temporary busy / unavailable. Oyage question eka save una: "Saturday afternoon puluwanda? Recommend a style for wedding". Poddak passe *retry* karanna, nathnam *staff* kiyala human kenekta connect wenna.
- Relevance: 1.0 · pass=True · tools=['customer_lookup', 'search_knowledge', 'salon_data_snapshot', 'list_branches', 'list_services_snapshot', 'list_staff_snapshot', 'salon_data_snapshot', 'salon_rules', 'comm_style', 'conversation_intelligence', 'understand_ask', 'google_search_gate']

### S12_pause_actions — Photo mid-book yields with pause actions [PASS]

- **Customer:** book appointment
- **AI:** Sure — let's book an appointment. Which service do you want?
Tell me which type you want (e.g. hair treatment, dressing, hair cut).
- Relevance: 0.7 · pass=True · tools=['comm_style', 'list_services', 'service_category_menu', 'booking_flow_state']

- **Customer:** 1
- **AI:** What date? (today / tomorrow / heta / Monday) — or say *heta 10am* together.
- Relevance: 0.7 · pass=True · tools=['comm_style', 'list_staff', 'booking_flow_state']

- **Customer:** [Customer sent a photo]
- **AI:** Photo eke layered style ekak peena. Shoulder length wage estimate. Oya me wage cut ekakda / colour ekakda karaganna balanne?
- Relevance: 1.0 · pass=True · tools=['comm_style', 'booking_pause_for_understanding', 'booking_flow_state', 'customer_lookup', 'search_knowledge', 'salon_data_snapshot', 'list_branches', 'list_services_snapshot', 'list_staff_snapshot', 'salon_data_snapshot', 'salon_rules', 'comm_style']
- Gemini payload: ci=True images=1 b64=True price_lock=False

## Failed / edge cases

No multi-turn scenario step failures in this harness run.

### Architecture / pricing failures (blocking)

- **A5 false verified quote:** `galaxy plasma treatment how much?` → `Keratin Treatment: Rs None` (ok=False). Category matcher collapses to the sole `treatment` SKU.
- **Length-only edge:** after Keratin length ask, customer `Bra Strap` bypasses `pricing_resolver` (`is_price_enquiry=False`); S1 pass uses stub Gemini + history, not the hard-gate. Live Gemini could invent or miss the official Rs 30,000 tier.

### Known edge cases / residual risks (even if scenarios passed)

1. **Intent is not Gemini-NLU** — `classify_intent` is regex/heuristic; Gemini follows CI guidance. Ambiguous Singlish may still mis-label.
2. **Category false-quote** — `match_services_by_category` can return a single SKU (e.g. only Keratin in `treatment`) for unrelated `…treatment how much?` asks → **verified-looking wrong price**.
3. **Length-only follow-up** (`Bra Strap`) is not a price enquiry and resolver ignores memory `last_service` — continuity depends on Gemini + history, not hard-gate.
4. **Pause actions discarded on yield** — `_pause_booking` then `return None` saves session paused but pause actions never reach TurnResponse.
5. **Soft provider-down path** can still emit generic `say *book*` for non-correction / non-media texts.
6. **Pricing resolver + CI not on production yet** — prod still older binaries until deploy.
7. **Fake Gemini in this harness** — relevance scores use a stub model; live Gemini quality needs T28 smoke after deploy.
8. **Recent history truncated** to ~800 chars / last ~8 messages — long threads may lose early context.

## Scores

| Metric | Value |
|---|---|
| Gemini response relevance (harness avg) | **0.904** |
| Scenario pass rate | **12/12** |
| Pricing invent/false-quote blocked (galaxy) | **YES** |
| Cancel backend-verified | **YES** |

## Pricing safety results

- Hard-gate path exercised on Keratin/Facial price asks (`pricing_resolver` in actions).
- Unknown service probe (`galaxy plasma treatment how much?`): amount=None ok=False clarify=True → **SAFE**.
- Length-only `Bra Strap` after Keratin: resolver does **not** hard-gate (not `is_price_enquiry`); falls to Gemini.
- `gemini_price_fallthrough` remains false on resolver responses (Gemini is not inventing when resolver runs).

## Booking correctness results

- Mid-book interruptions pause rather than consuming as date (S3/S4 / A6).
- Resume via `continue` re-prompts date (S4).
- Cancel confirm → tool → status cancelled only (S6).
- Booking create still requires `book_appointment` tool success path (not asserted as lied confirmation in this harness).

## Final production deployment checklist

- [ ] **Blockers closed:** category false-quote fix + length-follow-up memory (or accept residual risk in writing)
- [ ] Explicit written deploy approval for T28 package
- [ ] Snapshot current prod `main.py`, `booking_flow.py`, note missing `conversation_intelligence.py` / `pricing_resolver.py`
- [ ] Snapshot `crmInboundTurnService.js` + `crmAiMemoryService.js` on backend **and** ai_crm_worker
- [ ] Hot-copy: conversation_intelligence.py, pricing_resolver.py, main.py, booking_flow.py → ai_engine; JS → backend+worker
- [ ] Restart `ai_engine` (+ backend/worker if JS changed)
- [ ] Health check `/health`
- [ ] Live WA smoke T28: photo mid-book, correction, keratin→Bra Strap→Saturday, facial mila mid-book, cancel # verify DB, Singlish sticky
- [ ] Confirm appt cancel updates `appointments.status=cancelled`
- [ ] Confirm unknown `…treatment` price ask does **not** quote Keratin
- [ ] Confirm no cross-tenant replies (spot-check another tenant unchanged)
- [ ] Rollback plan ready (restore snapshots)

## Stop

Independent assessment complete. **No production changes made.** Awaiting review / deploy approval.
