# RC3 Release Readiness Report — Larvendo T28

**RC ID:** `phase4c_t28_rc3`  
**Parent:** `phase4c_t28_rc2` (**immutable**)  
**Created:** 2026-11-14  
**Tenant:** 28  
**Status:** **HOLD — NOT APPROVED FOR DEPLOY**

---

## 1. Verdict

| Gate | Status |
|---|---|
| Scope limited to category intent filtering | ✅ |
| RC2 not modified | ✅ |
| Manifest + SHA-256 present | ✅ |
| Import / syntax smoke | ✅ |
| Category regression tests | ✅ 33 passed |
| Pricing gate preserved | ✅ (resolver SHA matches RC2) |
| Backend/worker delta vs RC2 | ✅ none (RC2 copies packaged) |
| Production deploy | ❌ **blocked — awaiting separate explicit approval** |
| Production restart | ❌ blocked |
| WhatsApp send | ❌ blocked |

**Release readiness:** Candidate packaged and documented. **Do not deploy** until a separate approval message is given.

---

## 2. Bundle location

```text
_release/phase4c_t28_rc3/
  MANIFEST.json
  SHA256SUMS.txt
  DEPLOY_ORDER.txt
  ai_engine/app/main.py
  ai_engine/app/booking_flow.py
  ai_engine/app/pricing_resolver.py          (from RC2)
  ai_engine/app/conversation_intelligence.py (from RC2)
  backend/services/...                       (from RC2)
  worker/services/...                        (from RC2)
  ai_engine/tests/test_customer_intent_category_filtering.py  (audit only)
```

---

## 3. Changed vs RC2 (deployable)

| File | SHA-256 |
|---|---|
| `ai_engine/app/booking_flow.py` | `7d5e4d9f5ba17111f967cfff41349d19a79af3c378ae1ecc1f3bdeb93a16bbba` |
| `ai_engine/app/main.py` | `460d4c5d3a185268ca5524070f2900ae65c4acf9a5f970cd3bf078daf1bc9fd5` |

Verify with:

```text
_release/phase4c_t28_rc3/SHA256SUMS.txt
_release/phase4c_t28_rc3/MANIFEST.json
```

---

## 4. What RC3 fixes

- Intent-first category resolution (`resolve_catalogue_for_message`)
- Hair Cut / Facial / Keratin / Colour / Waxing / Threading / Eyebrow / Clean-up / Straightening
- Gemini `services_block` triggered for category asks (not only generic “services?”)
- Salon snapshot no longer falls back to Facials-biased `services[:40]`
- Strict live-DB category boundaries (no Facials “Treatment” name leak into Hair Treatment)

---

## 5. What RC3 deliberately excludes

- Voice inbound fixes (local WIP in backend — **not** in this RC)
- AI model / API key hygiene
- Stuck handoff cleanup
- Any production WhatsApp smoke (requires separate approval after deploy approval)

---

## 6. Proposed deploy order (only after approval)

1. Deploy `ai_engine/app/booking_flow.py`  
2. Deploy `ai_engine/app/main.py`  
3. Restart **ai_engine** only  
4. Separate Phase-5-style WA smoke for category cases (separate approval)

---

## 7. Rollback

Restore RC2 `main.py` + `booking_flow.py` checksums from `_release/phase4c_t28_rc2/` and restart ai_engine.

---

## 8. STOP

RC3 candidate is ready for **human review only**.  
**No deploy · no production restart · no WhatsApp** without a new explicit approval.
