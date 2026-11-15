# RC4 Release Readiness Report — Larvendo T28

**RC ID:** `phase4c_t28_rc4`  
**Parent:** `phase4c_t28_rc3` (**immutable · already deployed**)  
**Scope:** Mandatory Sir / Madam customer respect tone  
**Created:** 2026-11-14  
**Status:** **HOLD — NOT APPROVED FOR DEPLOY**

> Naming: brief asked for an “RC3 candidate”, but **RC3 is already live** (category filtering). This Sir/Madam change is therefore **RC4**.

---

## 1. Verdict

| Gate | Status |
|---|---|
| Local implementation complete | ✅ |
| Regression tests (85) | ✅ |
| Manifest + SHA-256 | ✅ |
| Import / syntax smoke | ✅ |
| Parent RC3 not overwritten | ✅ |
| Production deploy | ❌ blocked |
| Production restart | ❌ blocked |
| WhatsApp | ❌ not sent |

---

## 2. Bundle

```text
_release/phase4c_t28_rc4/
  MANIFEST.json
  SHA256SUMS.txt
  DEPLOY_ORDER.txt
  ai_engine/app/customer_respect.py   (NEW)
  ai_engine/app/main.py               (changed)
  backend/services/crmAiMemoryService.js (changed)
  worker/services/crmAiMemoryService.js  (mirror)
  … RC3 baseline copies for unchanged modules
```

### Deployable SHA-256 (changed)

| File | SHA-256 |
|---|---|
| `ai_engine/app/customer_respect.py` | `26e2d24db460c12f1f58aeea80aa98549be371f53219153e6b706b0b5954d2ae` |
| `ai_engine/app/main.py` | `a17474c5d2888380bc7d0df7d8305364d4b956d8a5c62d528a886e2ab475f490` |
| `backend/services/crmAiMemoryService.js` | `8fbe1f9307f0c2295e0e57ac2424ab05b94f1d23890ecc2526a2c76766895cac` |

---

## 3. Proposed deploy order (only after approval)

1. CREATE `ai_engine/app/customer_respect.py`  
2. REPLACE `ai_engine/app/main.py`  
3. REPLACE backend + worker `crmAiMemoryService.js`  
4. Restart `ai_engine`, then `backend` + `ai_crm_worker`  
5. Separate WA smoke approval for Sir/Madam samples  

---

## 4. Related reports

- `docs/CUSTOMER_RESPECT_TONE_IMPLEMENTATION_REPORT.md`  
- `docs/SIR_MADAM_LANGUAGE_REGRESSION_REPORT.md`  

---

## 5. STOP

RC4 candidate ready for **human review only**.  
**No deploy · no restart · no WhatsApp** without a new explicit approval.
