"""
Phase 6 RC7 production deploy — after explicit "commit and deploy" approval.

Scope: conversation truth, relative dates (Asia/Colombo), service/duration retention,
advanced receptionist modules from RC6+.
- Snapshot prod files first
- Deploy from _release/phase6_t28_rc7/
- Restart ai_engine, backend, ai_crm_worker
- No WhatsApp sends
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

ROOT = Path(r"e:\salon_v1")
RC = ROOT / "_release" / "phase6_t28_rc7"
OUT = ROOT / "_scripts" / "_phase6_rc7_deploy_evidence.json"
REPORT = ROOT / "docs" / "PHASE6_RC7_DEPLOYMENT_EXECUTION_REPORT.md"
HOST = "46.62.135.100"
APP = "/root/xanesalon"

DEPLOY_FILES = {
    "ai_engine/app/conversation_truth.py": f"{APP}/ai_engine/app/conversation_truth.py",
    "ai_engine/app/turn_planner.py": f"{APP}/ai_engine/app/turn_planner.py",
    "ai_engine/app/turn_trace.py": f"{APP}/ai_engine/app/turn_trace.py",
    "ai_engine/app/response_quality.py": f"{APP}/ai_engine/app/response_quality.py",
    "ai_engine/app/conversation_intelligence.py": f"{APP}/ai_engine/app/conversation_intelligence.py",
    "ai_engine/app/pricing_resolver.py": f"{APP}/ai_engine/app/pricing_resolver.py",
    "ai_engine/app/booking_flow.py": f"{APP}/ai_engine/app/booking_flow.py",
    "ai_engine/app/main.py": f"{APP}/ai_engine/app/main.py",
    "backend/services/crmHandoffInboundPolicy.js": f"{APP}/backend/services/crmHandoffInboundPolicy.js",
    "backend/services/crmAiMemoryService.js": f"{APP}/backend/services/crmAiMemoryService.js",
}


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def _passwords() -> list[str]:
    out: list[str] = []
    env = (os.environ.get("SALON_SSH_PASSWORD") or "").strip()
    if env:
        out.append(env)
    secrets = ROOT / "_scripts" / "_ssh_secrets.json"
    if secrets.exists():
        try:
            data = json.loads(secrets.read_text(encoding="utf-8"))
            for key in ("password", "passwords"):
                val = data.get(key)
                if isinstance(val, str) and val.strip() and val.strip() not in out:
                    out.append(val.strip())
                elif isinstance(val, list):
                    for item in val:
                        s = str(item).strip()
                        if s and s not in out:
                            out.append(s)
        except Exception:
            pass
    import ast
    import re

    for name in (
        "_deploy_phase6_rc4_approved.py",
        "_deploy_phase6_rc3_approved.py",
        "_deploy_phase6_rc6_approved.py",
    ):
        p = ROOT / "_scripts" / name
        if not p.exists():
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
            m = re.search(r"PASSWORDS\s*=\s*(\[[^\]]+\])", text)
            if not m:
                continue
            for item in ast.literal_eval(m.group(1)):
                s = str(item).strip()
                if s and s not in out:
                    out.append(s)
        except Exception:
            pass
    return out


def connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    pws = _passwords()
    if not pws:
        raise SystemExit(
            "SSH password missing. Set SALON_SSH_PASSWORD or _scripts/_ssh_secrets.json"
        )
    last = None
    for pw in pws:
        try:
            client.connect(HOST, username="root", password=pw, timeout=25)
            return client
        except Exception as exc:
            last = exc
    raise SystemExit(f"SSH failed: {last}")


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 300) -> str:
    print(">>>", cmd[:320])
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = (o.read() + e.read()).decode("utf-8", "replace")
    print(out[-7000:] if len(out) > 7000 else out)
    return out


def main() -> int:
    manifest = json.loads((RC / "MANIFEST.json").read_text(encoding="utf-8"))
    evidence: dict = {
        "mode": "phase6_rc7_production_deploy",
        "approval": "commit and deploy",
        "started_utc": datetime.now(timezone.utc).isoformat(),
        "bundle": str(RC),
        "rc_id": "phase6_t28_rc7",
        "whatsapp": "NOT_AUTHORIZED_NOT_SENT",
        "steps": [],
    }

    local_ok = True
    local_hashes = {}
    for rel in DEPLOY_FILES:
        p = RC / rel
        if not p.exists():
            local_ok = False
            evidence.setdefault("hash_mismatch", []).append({"rel": rel, "error": "missing"})
            continue
        h = sha256(p)
        local_hashes[rel] = h
        expect = (manifest.get("files") or {}).get(rel, {}).get("sha256")
        if expect and h != expect:
            local_ok = False
            evidence.setdefault("hash_mismatch", []).append({"rel": rel, "got": h, "expect": expect})
    evidence["local_hashes"] = local_hashes
    evidence["local_match_manifest"] = local_ok
    if not local_ok:
        evidence["error"] = "RC local hashes mismatch — abort"
        OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        print(json.dumps({"ok": False, "error": evidence["error"]}, indent=2))
        return 1

    client = connect()
    evidence["steps"].append({"ssh": True})
    print("SSH ok")

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    snap = f"{APP}/_rollback/phase6_rc7_{ts}"
    evidence["snapshot_dir"] = snap

    snap_cmd = f"""
set -e
SNAP={snap}
mkdir -p "$SNAP/ai_engine" "$SNAP/backend" "$SNAP/worker" "$SNAP/meta"
cd {APP}
for f in conversation_truth.py turn_planner.py turn_trace.py response_quality.py conversation_intelligence.py pricing_resolver.py booking_flow.py main.py; do
  docker compose cp ai_engine:/app/app/$f "$SNAP/ai_engine/$f" 2>/dev/null || echo ABSENT:$f > "$SNAP/ai_engine/$f.ABSENT"
done
for f in crmHandoffInboundPolicy.js crmAiMemoryService.js; do
  docker compose cp backend:/app/services/$f "$SNAP/backend/$f" 2>/dev/null || echo ABSENT:$f > "$SNAP/backend/$f.ABSENT"
  docker compose cp ai_crm_worker:/app/services/$f "$SNAP/worker/$f" 2>/dev/null || echo ABSENT:$f > "$SNAP/worker/$f.ABSENT"
done
docker compose ps ai_engine backend ai_crm_worker > "$SNAP/meta/compose_ps.txt" || true
echo SNAP_OK
"""
    out = run(client, snap_cmd, timeout=180)
    evidence["steps"].append({"snapshot": "SNAP_OK" in out, "raw_tail": out[-500:]})
    if "SNAP_OK" not in out:
        evidence["error"] = "snapshot_failed"
        OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        client.close()
        return 1

    sftp = client.open_sftp()
    for d in [f"{APP}/ai_engine/app", f"{APP}/backend/services"]:
        try:
            sftp.stat(d)
        except OSError:
            run(client, f"mkdir -p {d}")
    for rel, remote in DEPLOY_FILES.items():
        local = RC / rel
        print("put", rel, "->", remote)
        sftp.put(str(local), remote)
    sftp.close()
    evidence["steps"].append({"sftp_upload": True, "files": list(DEPLOY_FILES.keys())})

    cp_cmd = f"""
set -e
cd {APP}
docker cp {APP}/ai_engine/app/conversation_truth.py xanesalon-ai_engine-1:/app/app/conversation_truth.py
docker cp {APP}/ai_engine/app/turn_planner.py xanesalon-ai_engine-1:/app/app/turn_planner.py
docker cp {APP}/ai_engine/app/turn_trace.py xanesalon-ai_engine-1:/app/app/turn_trace.py
docker cp {APP}/ai_engine/app/response_quality.py xanesalon-ai_engine-1:/app/app/response_quality.py
docker cp {APP}/ai_engine/app/conversation_intelligence.py xanesalon-ai_engine-1:/app/app/conversation_intelligence.py
docker cp {APP}/ai_engine/app/pricing_resolver.py xanesalon-ai_engine-1:/app/app/pricing_resolver.py
docker cp {APP}/ai_engine/app/booking_flow.py xanesalon-ai_engine-1:/app/app/booking_flow.py
docker cp {APP}/ai_engine/app/main.py xanesalon-ai_engine-1:/app/app/main.py
docker cp {APP}/backend/services/crmHandoffInboundPolicy.js xanesalon-backend-1:/app/services/crmHandoffInboundPolicy.js
docker cp {APP}/backend/services/crmHandoffInboundPolicy.js xanesalon-ai_crm_worker-1:/app/services/crmHandoffInboundPolicy.js
docker cp {APP}/backend/services/crmAiMemoryService.js xanesalon-backend-1:/app/services/crmAiMemoryService.js
docker cp {APP}/backend/services/crmAiMemoryService.js xanesalon-ai_crm_worker-1:/app/services/crmAiMemoryService.js
echo CP_OK
"""
    out = run(client, cp_cmd, timeout=120)
    evidence["steps"].append({"docker_cp": "CP_OK" in out})
    if "CP_OK" not in out:
        evidence["error"] = "docker_cp_failed"
        OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        client.close()
        return 2

    out = run(client, f"cd {APP} && docker compose restart ai_engine ai_crm_worker backend", timeout=240)
    evidence["steps"].append({"restart": True, "tail": out[-400:]})
    time.sleep(30)

    verify = run(
        client,
        f"""
cd {APP}
docker compose exec -T ai_engine python - <<'PY'
from datetime import date
from app.conversation_truth import parse_relative_date, short_numeric_intent
from app.response_quality import validate_customer_reply, decompose_customer_asks
from app.booking_flow import _parse_date, _pick_by_index_or_name, is_exact_confirm
from app.turn_planner import build_turn_plan
from app.conversation_intelligence import build_conversation_context
import json
now = date(2026, 11, 15)
rel = parse_relative_date('labana mase 1laweni sathiye', now=now)
d = _parse_date('labana mase 1laweni sathiye', now=now)
pick = _pick_by_index_or_name('11 kiy nne me masene', [{{'id': i, 'name': str(i)}} for i in range(1, 20)])
ni = short_numeric_intent('11 kiy nne me masene', expected_step='date')
ctx = build_conversation_context(message='Butterfly kiyada?', tenant_id=28, memory={{'last_service':'haircut'}})
plan = build_turn_plan(message='Butterfly kiyada?', ctx=ctx)
units = decompose_customer_asks('Butterfly kiyada? Kandy branch eka koheda?')
bad = validate_customer_reply('Butterfly kiyada? Kandy branch eka koheda?', 'Nice.', has_media=False)
ok = (
    rel.get('date') == '2026-12-05' and d == '2026-12-05'
    and pick is None and ni == 'date_day'
    and len(plan.steps) == 9 and len(units) >= 2 and bad.ok is False
    and is_exact_confirm('Book')
)
print('PHASE6_RC7_AI_OK' if ok else 'PHASE6_RC7_AI_FAIL', json.dumps({{
    'date': d, 'rel': rel.get('date'), 'pick': pick, 'ni': ni, 'units': len(units)
}}))
if not ok:
    raise SystemExit(2)
PY
docker compose exec -T ai_crm_worker node -e "
const p=require('./services/crmHandoffInboundPolicy');
const checks=[
  p.shouldAssistDuringHandoff('Check history','queued'),
  p.shouldAssistDuringHandoff('I need haircut booking for tomorrow 8.30am','queued'),
  p.HANDOFF_SOFT_BUMP_TTL_SEC <= 120
];
if (checks.some(v => !v)) {{ console.log('PHASE6_RC7_WORKER_FAIL', checks); process.exit(2); }}
console.log('PHASE6_RC7_WORKER_OK', JSON.stringify(checks));
"
docker compose ps ai_engine ai_crm_worker backend
""",
        150,
    )
    evidence["verify"] = verify[-2500:]
    ok = "PHASE6_RC7_AI_OK" in verify and "PHASE6_RC7_WORKER_OK" in verify
    evidence["ok"] = ok
    evidence["finished_utc"] = datetime.now(timezone.utc).isoformat()
    OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")

    try:
        manifest["production_status"] = "DEPLOYED" if ok else "DEPLOY_FAILED"
        manifest["deployed_utc"] = evidence["finished_utc"]
        (RC / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        (RC / "DEPLOY_ORDER.txt").write_text(
            "PHASE 6 RC7 — Conversation Truth + Booking Consistency\n"
            f"Status: {'DEPLOYED' if ok else 'DEPLOY_FAILED'} ({evidence['finished_utc']})\n"
            "WhatsApp: NOT SENT\n",
            encoding="utf-8",
        )
    except Exception as exc:
        evidence["manifest_update_error"] = str(exc)

    REPORT.write_text(
        "# Phase 6 RC7 Deployment Execution Report — Larvendo T28\n\n"
        f"**RC:** `phase6_t28_rc7`\n"
        f"**Approval:** `commit and deploy`\n"
        f"**Started (UTC):** {evidence['started_utc']}\n"
        f"**Finished (UTC):** {evidence['finished_utc']}\n"
        f"**Result:** {'SUCCESS' if ok else 'FAILED'}\n"
        f"**WhatsApp:** NOT SENT\n"
        f"**Rollback snapshot:** `{snap}`\n\n"
        "## Files deployed\n\n"
        + "\n".join(f"- `{r}`" for r in DEPLOY_FILES)
        + "\n\n## Verify\n\n```\n"
        + verify[-1800:]
        + "\n```\n\n"
        f"Evidence JSON: `_scripts/_phase6_rc7_deploy_evidence.json`\n",
        encoding="utf-8",
    )

    client.close()
    print(json.dumps({"ok": ok, "out": str(OUT), "report": str(REPORT)}, indent=2))
    return 0 if ok else 4


if __name__ == "__main__":
    raise SystemExit(main())
