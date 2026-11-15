# AI Engine Deployment Approval Report

**Prepared:** 2026-11-14  
**Target:** Production `xanesalon-ai_engine-1` @ `46.62.135.100`  
**Scope:** Pricing resolver + Phase 3 booking polish  
**Status:** **NOT DEPLOYED** — awaiting explicit approval  

---

## 1. Exact files and changes to deploy

| Local file | Action on production | Prod today |
|---|---|---|
| `ai_engine/app/pricing_resolver.py` | **CREATE** via `docker cp` | **MISSING** |
| `ai_engine/app/main.py` | **REPLACE** | present (different hash) |
| `ai_engine/app/booking_flow.py` | **REPLACE** | present (different hash) |

### Content hashes (SHA256 prefix)

| File | Local | Production container |
|---|---|---|
| `main.py` | `1c56f0b31ad492f1` | `54fb1d8e327ad022` |
| `booking_flow.py` | `16d8ca7cbf417025` | `1933294042289bf8` |
| `pricing_resolver.py` | `4f726456e9c23eac` | **MISSING** |

### What these changes do

**`pricing_resolver.py` (new)**  
Deterministic price quotes from live catalogue + official length tiers; conflict → escalate; unknown → no invent inside resolver.

**`main.py`**  
After booking SM, before Gemini: `_maybe_pricing_resolver_reply()` for price / length-tier asks.

**`booking_flow.py`**  
Pre-confirm slot re-check (double-book prevention); fail-closed on availability errors; success message includes `Ref: #id`; Singlish booked template.

### Explicitly NOT in this deploy package

- Backend / DB migrations  
- Staff reactivation  
- Service catalogue / price row changes  
- Other tenants’ data  
- Git commit / push  
- Full image rebuild (hot-copy + restart only, matching prior Larvendo deploys)

### Tests already passed locally (pre-deploy evidence)

- Pytest **72/72** (pricing + booking + flows)  
- Behaviour harness **17/17**

---

## 2. Production compatibility assessment

| Check | Result |
|---|---|
| Service | `xanesalon-ai_engine-1` **healthy** (Up, port 8010) |
| Runtime | Python uvicorn — hot-copy of `.py` is compatible (prior deploys used same method) |
| New dependency packages | **None** (stdlib + existing app imports only) |
| API contract `/v1/turns` | Unchanged request/response models; additive `actions` tool events |
| Salon tools | Uses existing `list_services`, `check_availability`, `book_appointment` |
| Env `AI_ENGINE_SERVICE_SECRET` | **SET** in container |
| Env `SALON_API_URL` | Compose sets `http://backend:5000/api` (probe showed process env may omit dump; compose config is source of truth) |
| Provider keys in container env | `GEMINI_API_KEY` / `OPENAI_API_KEY` unset at process env — expected; tenant keys via `tenant_credentials` / DB (current prod already works this way) |
| Redis session | Unchanged `session_store` usage |
| Migrations | **None** |
| DB writes by deploy itself | **None** (code only) |
| KB / Service tables | **Not modified** by this deploy |
| Other tenants | Code is multi-tenant safe; no tenant-specific hardcode in deploy files beyond existing patterns |

**Compatibility verdict:** Compatible with hot-file deploy + `ai_engine` restart. No schema migration required.

---

## 3. Backup and rollback verification

### Current backup posture (probe)

| Item | Finding |
|---|---|
| `/root/xanesalon/backups` | Not present / empty in probe |
| Host disk | `/` **82%** used (6.6G free) — tight; keep backups small |
| App-level rollback | Must snapshot **current container files** before overwrite |

### Required pre-deploy backup (part of approved procedure — not run yet)

```bash
# On production host
TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /root/xanesalon/rollback/ai_engine_$TS
docker cp xanesalon-ai_engine-1:/app/app/main.py \
  /root/xanesalon/rollback/ai_engine_$TS/main.py
docker cp xanesalon-ai_engine-1:/app/app/booking_flow.py \
  /root/xanesalon/rollback/ai_engine_$TS/booking_flow.py
# pricing_resolver does not exist yet — note absence
echo "pricing_resolver=MISSING" > /root/xanesalon/rollback/ai_engine_$TS/MANIFEST.txt
sha256sum /root/xanesalon/rollback/ai_engine_$TS/* > /root/xanesalon/rollback/ai_engine_$TS/SHA256SUMS
```

Optional DB dump (not required for this code-only deploy; recommended if doing other ops same window):

```bash
# Optional — only if approving a DB dump as well
docker compose -f /root/xanesalon/docker-compose.yml exec -T db \
  sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  > /root/xanesalon/rollback/db_$TS.sql
```

### Rollback readiness

| Path | Ready? |
|---|---|
| Restore previous `main.py` + `booking_flow.py` | Yes, **after** pre-deploy snapshot |
| Remove `pricing_resolver.py` | Yes (`rm` in container + restart) |
| KB #27/#28 | Independent of this deploy; separate rollback JSON already exists from Phase 1/2 |

**Verdict:** Rollback is ready **only if** the pre-deploy file snapshot step is executed first. No automated backup of ai_engine files exists today.

---

## 4. KB correction preservation check

Live Tenant 28 (probed just now):

| ID | Priority | Ladies Hair Cut line | 75 min | 45 min |
|---:|---:|---|---|---|
| 27 | 72 | `Ladies Hair Cut — 45 min · LKR 3500.00` | no | yes |
| 28 | 72 | `Ladies Hair Cut — 45 min · LKR 3500.00` | no | yes |

**Will deploy overwrite KB?** **No.** Deploy copies Python files into `ai_engine` only. It does not call auto-train, does not update `crm_knowledge_articles`, and does not restart a job that rewrites KB.

**Risk of later overwrite:** A future `autoTrainFromSalon(28)` or Google auto-train could change *other* articles; titles `#27/#28` are Google articles, not salon auto-train titles `#23/#24/#25`. This deploy does not trigger those.

---

## 5. Pricing fallback safety assessment

### Can the resolver fall through to Gemini with an unverified price?

**Yes — for some price asks.**

| Scenario | Resolver behaviour | Then |
|---|---|---|
| Keratin / Botox / Rebonding / highlights / known fixed cuts | Handles or asks length | No Gemini |
| Conflict (live vs official) | Escalate / handoff flag | No invented fixed quote from resolver |
| `list_services` tool failure | Returns `None` | **Falls through to Gemini** |
| Ambiguous “price please” | Early `None` | Gemini clarifies |
| Covered weakly (e.g. `facial mila`, `waxing how much`) | `ok=False`, no escalate | **`None` → Gemini** |
| Completely unknown service | Same | **`None` → Gemini** |

Local probe examples that fall through today:

- `facial mila eka kiyanna`  
- `waxing how much`  
- `quantum laser price`  

Mitigations already in production prompts/rules (“Never invent prices”, live salon data block, tenant rules). These reduce but **do not guarantee** Gemini never emits a number.

### Safety verdict

| Level | Notes |
|---|---|
| Resolver path | Safe for covered services |
| Gemini fallback path | **Residual invent risk** for uncovered price categories |
| Recommendation | Treat as **soft blocker**: either (A) accept residual risk with post-deploy smoke monitoring, or (B) approve a small pre-deploy harden that answers “which service / team confirm” instead of falling through when `ask.price` and resolver returns empty |

**No hard blocker** for deploy of covered Keratin/haircut paths, but uncovered categories remain Gemini-dependent.

---

## 6. Deployment commands (DO NOT RUN until approved)

### A. Upload from operator machine (pattern used previously)

```powershell
# From repo root on Windows operator machine (example)
python -c "import paramiko; from pathlib import Path
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
# ...connect...
sftp=c.open_sftp()
root=Path(r'e:\salon_v1')
for rel in ['ai_engine/app/main.py','ai_engine/app/booking_flow.py','ai_engine/app/pricing_resolver.py']:
  sftp.put(str(root/rel), '/root/xanesalon/'+rel.replace('\\\\','/'))
sftp.close(); c.close()"
```

### B. On production host — backup, install, restart

```bash
set -e
TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /root/xanesalon/rollback/ai_engine_$TS
docker cp xanesalon-ai_engine-1:/app/app/main.py /root/xanesalon/rollback/ai_engine_$TS/main.py
docker cp xanesalon-ai_engine-1:/app/app/booking_flow.py /root/xanesalon/rollback/ai_engine_$TS/booking_flow.py
echo "pricing_resolver=MISSING_BEFORE" > /root/xanesalon/rollback/ai_engine_$TS/MANIFEST.txt

docker cp /root/xanesalon/ai_engine/app/main.py xanesalon-ai_engine-1:/app/app/main.py
docker cp /root/xanesalon/ai_engine/app/booking_flow.py xanesalon-ai_engine-1:/app/app/booking_flow.py
docker cp /root/xanesalon/ai_engine/app/pricing_resolver.py xanesalon-ai_engine-1:/app/app/pricing_resolver.py

cd /root/xanesalon && docker compose restart ai_engine
# wait for healthy
docker compose ps ai_engine
docker compose exec -T ai_engine python -c "from app.pricing_resolver import resolve_price; from app.main import _maybe_pricing_resolver_reply; print('import_ok')"
```

### Downtime / blast radius

| Item | Impact |
|---|---|
| Restart `ai_engine` only | ~10–30s turn latency / possible in-flight turn retry |
| Backend / DB / WhatsApp gateway | **Not restarted** |
| Migrations | None |
| Customer data writes | None from deploy |

---

## 7. Rollback commands

```bash
# Use the TS directory created at deploy time
TS=<paste_from_deploy>
docker cp /root/xanesalon/rollback/ai_engine_$TS/main.py xanesalon-ai_engine-1:/app/app/main.py
docker cp /root/xanesalon/rollback/ai_engine_$TS/booking_flow.py xanesalon-ai_engine-1:/app/app/booking_flow.py
docker compose -f /root/xanesalon/docker-compose.yml exec -T ai_engine \
  rm -f /app/app/pricing_resolver.py
cd /root/xanesalon && docker compose restart ai_engine
docker compose exec -T ai_engine python -c "import app.main; print('rolled_back')"
```

KB #27/#28 are unaffected by this rollback. If KB must be reverted separately, use `_scripts/_kb_27_28_duration_fix.json` / Phase 1 rollback artifacts (titles/bodies).

---

## 8. Post-deployment Tenant 28 WhatsApp smoke-test plan

Run on **salon-larvendo** WhatsApp after healthy status:

| # | Customer message | Expect |
|---:|---|---|
| 1 | `Keratin ekak kiyada?` | Ask Shoulder / Bra Strap / Hip (resolver) — no single invented number |
| 2 | `keratin bra strap` | Guide Rs **30,000** / ~300 min + salon confirm note |
| 3 | `ladies hair cut mila` | Rs **3500** / **45** min |
| 4 | `Heta 10 am book karanna oni` | Booking SM continues; no crash |
| 5 | Complete book → `yes` | Success only with API id; message contains `Ref: #…` |
| 6 | `mage appointment eka cancel karann oni` | Customer identify + appt list/confirm (not ask_date) |
| 7 | `I want a discount 50%` | No invented discount |
| 8 | `I want to talk to a manager` | Handoff |
| 9 | Unrelated tenant check | No cross-tenant leakage (internal: actions show tenant 28 tools only) |

**Pass criteria:** No empty replies; no false “booked”; length services ask length; Ladies Cut 45 not 75; cancel identifies by phone.

---

## 9. Remaining blockers / decisions for approver

| ID | Severity | Item |
|---|---|---|
| B1 | ~~Soft~~ **Resolved locally** | Gemini price fallthrough hardened 2026-11-14 — see `docs/GEMINI_PRICE_FALLTHROUGH_AUDIT.md` (still needs deploy) |
| B2 | Soft | No standing ai_engine file backups until pre-deploy snapshot runs |
| B3 | Info | Disk 82% full — keep rollback copies lean |
| B4 | Info | Hot-copy ≠ image rebuild; next full `docker compose build ai_engine` must include these files or they can be lost |
| B5 | None | KB #27/#28 45-min correction — preserved by this deploy |
| B6 | None | Staff reactivation — not in scope |
| B7 | None | Migrations — none |

---

## 10. Approval request

Reply with explicit approval to execute, for example:

```
[ ] APPROVE deploy ai_engine package (pricing_resolver + main.py + booking_flow.py)
[ ] First harden Gemini price fallthrough (optional pre-deploy)
[ ] REJECT / defer
```

**Until that approval: no deploy, no restart, no production file overwrite, no commit, no push.**
