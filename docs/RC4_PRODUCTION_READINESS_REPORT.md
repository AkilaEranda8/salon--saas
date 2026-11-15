# RC4 Production Readiness — `phase6_t28_rc4`

**Scope:** Multi-question price/response completeness  
**Parent:** `phase6_t28_rc3` (**immutable until approved replace**)  
**Production status:** **NOT DEPLOYED**

## Checklist

| Item | Status |
|------|--------|
| Root cause identified | Done |
| Local fix implemented | Done |
| Regression tests | 295 related PASS |
| RC package + SHA256 | `_release/phase6_t28_rc4/` |
| Prod RC3 unmodified | Yes |
| Prod restart | Not done |
| Live WhatsApp | Not done |
| Commit/push | Not done |

## Deploy (when approved)

1. `ai_engine/app/pricing_resolver.py`  
2. `ai_engine/app/main.py`  
3. Restart `ai_engine` only  
4. Separate approval for WA smoke  

## Recommendation

**Do not deploy yet.** Await explicit approval.
