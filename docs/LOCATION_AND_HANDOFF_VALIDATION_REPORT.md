# Location and Handoff Validation Report — Larvendo T28

**RC:** `phase6_t28_rc3` (local candidate)  
**Status:** NOT DEPLOYED  

## D — Salon location

### Live branch record (tenant 28)

| Field | Value | Verified |
|-------|-------|----------|
| id | 30 | yes |
| name | Larvendo Kandy | yes |
| address | 254, William Gopallawa Mawatha,Kandy | yes |
| phone | 0812235955 | yes |
| status | active | yes |
| latitude | 7.2844288 | yes |
| longitude | 80.6264556 | yes |
| opening_hours on branch | **absent** | — |

### Rules applied

- AI may state **only** verified name / address / phone.
- Maps link derived from lat/lng: `https://maps.google.com/?q=7.2844288,80.6264556`.
- Hours: if not on branch record → **do not invent** (including generic Mon–Sat KB defaults); offer staff confirmation.
- Snapshot formatter: `format_verified_branches()`; inactive branches excluded.

Kandy address/phone in customer chat is **valid only when sourced from this branch record** (it is).

## C — Human handoff status

### Backend confirmation path

1. AI may emit `[HANDOFF:reason]` → soft request wording (not “already delivered”).
2. `crmInboundTurnService` sets `conversation.status = 'queued'` and enqueues `HANDOFF` job.
3. Episode ack (`handoffAckText`) is sent only for already-queued staff path and now says **queued for our team**.
4. While queued/human_active: FAQ/check-in/substantial assist continues; soft-bump cooldown short; no repetitive generic spam.

### Wording change

| Before | After |
|--------|-------|
| “team ekata danavum dennam” / implied already notified | “team ekata request ekak danawa” / requesting now |
| “message is with our team” (ambiguous) | “queued for our team” (ack after queue) |

### Staff association

- Handoff queue job + `notifyStaffInboundWhileHandoff` re-notify remain the staff path.
- Phase 6 does **not** invent a named staff assignee in customer chat (staff names stay hidden).

## Residual risk

- Opening hours still rely on tenant knowledge / staff confirmation until branch hours are stored.
- AI handoff sentence is generated before CRM write; mitigated by **request** language + CRM queue as source of truth for “queued”.
