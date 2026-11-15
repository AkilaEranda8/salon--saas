# RC5 Release Readiness Report — Larvendo T28

**RC ID:** `phase4c_t28_rc5`  
**Parent:** `phase4c_t28_rc4` (immutable)  
**Scope:** Post-handoff inbound routing (CRITICAL)  
**Status:** **HOLD — NOT APPROVED FOR DEPLOY**

> Brief asked for “RC3” if needed. **RC3 (category) is already deployed**; **RC4 (Sir/Madam) is local candidate**. This handoff fix is therefore **RC5**.

---

## 1. Verdict

| Gate | Status |
|---|---|
| Root cause evidenced | ✅ |
| Local fix + tests | ✅ |
| Manifest + SHA-256 | ✅ |
| Production untouched | ✅ |
| Deploy | ❌ blocked pending separate approval |

---

## 2. Bundle

```text
_release/phase4c_t28_rc5/
```

### Key deployables

| File | Role |
|---|---|
| `backend/services/crmHandoffInboundPolicy.js` | NEW policy |
| `backend/services/crmInboundTurnService.js` | Routing fix |
| `worker/services/*` mirrors | Worker must match backend |
| `ai_engine/app/booking_flow.py` | FAQ Singlish expand |
| `ai_engine/app/main.py` | Handoff-pending Gemini instructions |

---

## 3. Deploy order (only after approval)

1. CREATE policy JS (backend + worker)  
2. REPLACE `crmInboundTurnService.js` (backend + worker)  
3. REPLACE `booking_flow.py`, `main.py`  
4. Restart `ai_crm_worker`, `backend`, `ai_engine`  
5. Separate WA smoke for post-handoff location/duration  

---

## 4. Related reports

- `docs/HANDOFF_PENDING_MESSAGE_ROUTING_REPORT.md`  
- `docs/POST_HANDOFF_REPLY_FAILURE_REPORT.md`  
- `docs/HUMAN_HANDOFF_REGRESSION_REPORT.md`  

---

## 5. STOP

**No deploy · no restart · no WhatsApp** without a new explicit approval message.
