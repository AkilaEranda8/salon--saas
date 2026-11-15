# Post-Handoff Reply Failure Report — Larvendo T28

**Date:** 2026-11-14  
**Incident:** AI stops useful replies after human handoff; repeated generic ack / silence  

---

## 1. Failure mode

```text
status ∈ {queued, human_active}
  → skip AI entirely
  → optional generic ack (Redis NX EX 120)
  → if NX fails: customer gets nothing
```

Secondary: even when ack sends, location/duration questions never receive verified salon data.

---

## 2. Production investigation

| Check | Result |
|---|---|
| SSH read-only diag | Ran (`_scripts/_diag_handoff_pending_t28.py`) |
| DB psql in db container | Unavailable in PATH (no mutation attempted) |
| Worker code gate | **Confirmed present** on `ai_crm_worker` |
| Mutated production? | **No** |

Evidence file: `_scripts/_handoff_pending_diag.json`

---

## 3. Why “Koheda?” went silent

1. Conversation already `queued` after earlier handoff.  
2. Message persisted (`skipped_ai`).  
3. Ack key still set from prior message (&lt; 120s) → `allowAck = false`.  
4. Early `return` → no Gemini, no FAQ, no fallback bubble.

---

## 4. Fix verification (local)

| Scenario | Policy result |
|---|---|
| Kochchara wela yai da? | `shouldAssistDuringHandoff` → true |
| Oyage salon eka koheda thiyenne? | true |
| Kandy kiyala had? | true |
| Koheda? | true |
| Talk to staff | false (staff path) |

Node suite: `backend/tests/test_handoff_inbound_policy.js` — **all PASS**

---

## 5. Residual risk

| Risk | Mitigation |
|---|---|
| AI talks over active agent (`human_active`) | Only FAQ assist on `human_active` |
| Invented address/duration | Existing salon live data + pricing gates; handoff prompt forbids inventing |
| RC4 Sir/Madam not on prod yet | RC5 bundles respect module too; deploy order documented |

---

## 6. STOP

Await deploy approval. Do not restart production from this report.
