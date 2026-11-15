# Phase 6 Regression QA Report — Larvendo T28

**RC:** `phase6_t28_rc3`  
**Status:** LOCAL PASS — NOT DEPLOYED  

## Test suites run

| Suite | Result |
|-------|--------|
| `ai_engine/tests/test_phase6_conversation_quality.py` | PASS |
| `ai_engine/tests/test_customer_intent_category_filtering.py` | PASS |
| `ai_engine/tests/test_customer_respect_sir_madam.py` | PASS |
| Related `keratin|pricing|handoff|category|phase6|respect` filter | **282 passed** |
| `backend/tests/test_handoff_inbound_policy.js` | PASS |
| Import smoke (RC package) | PASS |

## Brief §3 coverage

| # | Requirement | Test / evidence |
|---|-------------|-----------------|
| 1 | Hair Cut + Layer + Butterfly one message | `test_multi_style_haircut_layer_and_butterfly` |
| 2 | Ladies vs Butterfly pricing | `test_butterfly_price_not_ladies_cut` |
| 3 | Facial options / duplicates | `test_facial_near_duplicates_remain_distinct` |
| 4 | Location / branch verification | `test_verified_branch_formatting_not_invented_hours` |
| 5 | Opening hours | Branch hours absent → explicit non-invent note |
| 6 | Multiple questions one message | `test_multi_question_intent_answers_all` |
| 7 | Handoff + FAQ after | Existing handoff-pending policy tests + prompt |
| 8 | Handoff confirm after backend | Request wording + queued ack text |
| 9 | Sir/Madam | Respect tests + Phase 6 handoff honorific |
| 10 | Sinhala / Singlish / English | `test_butterfly_multilingual_price` + respect modes |
| 11 | Topic switching | `test_topic_switch_haircut_to_location` |
| 12 | No invented service/price/location | Style/price/branch tests |

## Not run (boundaries)

- Live WhatsApp smoke  
- Production restart  
- Customer data mutation  

## Verdict

Local regression gate for Phase 6 conversation quality: **PASS**.  
Production gate: **HOLD** until separate deploy approval.
