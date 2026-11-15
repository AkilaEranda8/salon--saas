# RC3 Deployment Execution Report — Larvendo T28

**Date:** 2026-11-14  
**Approval:** `RC3 deploy approve`  
**RC:** `phase4c_t28_rc3`  
**Parent:** `phase4c_t28_rc2` (immutable)  
**Result:** **DEPLOYED — OK**

---

## 1. Summary

| Item | Status |
|---|---|
| Snapshot before deploy | ✅ `/root/xanesalon/_rollback/phase4c_rc3_20261114_130500` |
| `booking_flow.py` | ✅ deployed |
| `main.py` | ✅ deployed |
| ai_engine restart | ✅ healthy |
| Hash match RC3 manifest | ✅ |
| Pricing resolver unchanged (RC2) | ✅ |
| Category gate smoke | ✅ |
| Backend / worker | untouched |
| WhatsApp | **NOT SENT** |

---

## 2. Post-deploy hashes (ai_engine container)

| File | SHA-256 |
|---|---|
| `ai_engine/app/main.py` | `460d4c5d3a185268ca5524070f2900ae65c4acf9a5f970cd3bf078daf1bc9fd5` |
| `ai_engine/app/booking_flow.py` | `7d5e4d9f5ba17111f967cfff41349d19a79af3c378ae1ecc1f3bdeb93a16bbba` |
| `ai_engine/app/pricing_resolver.py` | `27fa6ab72c6b5b6aa59f39e8c2814fa536fbabe97a339041485ae10e02974f44` (unchanged) |

Evidence: `_scripts/_rc3_deploy_evidence.json`

---

## 3. Smoke (in-container)

- `IMPORT_OK`
- `CATEGORY_GATE_OK` — `detect_service_category("Mata hair cut ekak kara ganna oni") == haircut`
- `FILTER_SMOKE_OK` — Hair Cut ask returns Hair Cut row only (Facials excluded)
- Container: `xanesalon-ai_engine-1` — **Up (healthy)**

---

## 4. Not done (needs separate approval)

- WhatsApp category smoke (Hair Cut / Facial live messages)
- Voice inbound fix deploy
- AI model / key hygiene
- Stuck handoff cleanup

---

## 5. Rollback

Restore from snapshot:

```text
/root/xanesalon/_rollback/phase4c_rc3_20261114_130500/ai_engine/
```

Then `docker cp` → ai_engine + `docker compose restart ai_engine`.
