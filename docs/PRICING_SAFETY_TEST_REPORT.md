# Pricing Safety Test Report

**Date:** 2026-11-14 · Local only

## Results

| Suite | Result |
|---|---|
| `test_pricing_fallthrough_safety.py` | PASS |
| `test_pricing_resolver.py` | PASS |
| `test_pricing_integration_cases.py` | PASS |
| Booking + flows regression | PASS |
| **Combined pytest** | **99/99** |
| Behaviour harness | **17/17** |

## Safety cases covered

- Facial / Waxing / Threading / Nails / Hair colour price asks (Singlish + EN)  
- Keratin length gate (SI / Singlish / EN)  
- Ladies haircut 3500/45 + duration conflict escalate  
- Unknown service → clarify/escalate, no invent  
- Inactive duplicate `#196` not preferred over `#291`  
- Every amount in replies ∈ verified allow-list  

## Language coverage

| Language | Examples | Pass |
|---|---|---|
| English | `Waxing how much?`, `Threading price?` | ✅ |
| Singlish | `Facial mila?`, `Nails kiyada?`, `Keratin ekak kiyada?` | ✅ |
| Sinhala | `හෙයාර් කට් … මිල`, `ෆේෂල් මිල`, `කෙරටින් මිල` | ✅ |
