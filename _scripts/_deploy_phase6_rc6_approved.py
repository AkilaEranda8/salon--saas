"""
Phase 6 RC6 production deploy — after explicit "all commit and deploy" approval.

Scope: advanced receptionist (response quality, human understanding, booking/pricing safety)
- Snapshot prod files first
- Deploy from _release/phase6_t28_rc6/
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
RC = ROOT / "_release" / "phase6_t28_rc6"
OUT = ROOT / "_scripts" / "_phase6_rc6_deploy_evidence.json"
REPORT = ROOT / "docs" / "PHASE6_RC6_DEPLOYMENT_EXECUTION_REPORT.md"
HOST = "46.62.135.100"
APP = "/root/xanesalon"

DEPLOY_FILES = {
    "ai_engine/app/response_quality.py": f"{APP}/ai_engine/app/response_quality.py",
    "ai_engine/app/conversation_intelligence.py": f"{APP}/ai_engine/app/conversation_intelligence.py",
    "ai_engine/app/pricing_resolver.py": f"{APP}/ai_engine/app/pricing_resolver.py",
    "ai_engine/app/booking_flow.py": f"{APP}/ai_engine/app/booking_flow.py",
    "ai_engine/app/main.py": f"{APP}/ai_engine/app/main.py",
    "backend/services/crmHandoffInboundPolicy.js": f"{APP}/backend/services/crmHandoffInboundPolicy.js",
}


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def _passwords() -> list[str]:
    """Passwords from env / local untracked secrets only — never hardcode in repo."""
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
    # Fall back to PASSWORDS list in prior local-only deploy scripts (not committed)
    import ast
    import re

    for name in ("_deploy_phase6_rc4_approved.py", "_deploy_phase6_rc3_approved.py"):
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
        "mode": "phase6_rc6_production_deploy",
        "approval": "all commit and deploy",
        "started_utc": datetime.now(timezone.utc).isoformat(),
        "bundle": str(RC),
        "rc_id": "phase6_t28_rc6",
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
    snap = f"{APP}/_rollback/phase6_rc6_{ts}"
    evidence["snapshot_dir"] = snap

    snap_cmd = f"""
set -e
SNAP={snap}
mkdir -p "$SNAP/ai_engine" "$SNAP/backend" "$SNAP/worker" "$SNAP/meta"
cd {APP}
for f in response_quality.py conversation_intelligence.py pricing_resolver.py booking_flow.py main.py; do
  docker compose cp ai_engine:/app/app/$f "$SNAP/ai_engine/$f" 2>/dev/null || echo ABSENT:$f > "$SNAP/ai_engine/$f.ABSENT"
done
for f in crmHandoffInboundPolicy.js; do
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
docker cp {APP}/ai_engine/app/response_quality.py xanesalon-ai_engine-1:/app/app/response_quality.py
docker cp {APP}/ai_engine/app/conversation_intelligence.py xanesalon-ai_engine-1:/app/app/conversation_intelligence.py
docker cp {APP}/ai_engine/app/pricing_resolver.py xanesalon-ai_engine-1:/app/app/pricing_resolver.py
docker cp {APP}/ai_engine/app/booking_flow.py xanesalon-ai_engine-1:/app/app/booking_flow.py
docker cp {APP}/ai_engine/app/main.py xanesalon-ai_engine-1:/app/app/main.py
docker cp {APP}/backend/services/crmHandoffInboundPolicy.js xanesalon-backend-1:/app/services/crmHandoffInboundPolicy.js
docker cp {APP}/backend/services/crmHandoffInboundPolicy.js xanesalon-ai_crm_worker-1:/app/services/crmHandoffInboundPolicy.js
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
    time.sleep(28)

    verify = run(
        client,
        f"""
cd {APP}
docker compose exec -T ai_engine python - <<'PY'
from app.response_quality import validate_customer_reply, decompose_customer_asks
from app.conversation_intelligence import classify_intent, is_referent_message
from app.booking_flow import _parse_time, _parse_date, is_exact_confirm
from app.pricing_resolver import is_price_rejection
import json
units = decompose_customer_asks('Butterfly kiyada? Kandy branch eka koheda?')
bad = validate_customer_reply('Butterfly kiyada? Kandy branch eka koheda?', 'Butterfly is nice.')
good = validate_customer_reply(
    'Butterfly kiyada? Kandy branch eka koheda?',
    'Butterfly Rs 4,500. Larvendo Kandy, William Gopallawa Mawatha.'
)
c = classify_intent('Eka keeyada?', memory={{'last_service':'keratin'}}, prior_topic='keratin')
ok = (
    len(units) >= 2 and bad.ok is False and good.ok is True
    and is_referent_message('Eka keeyada?') and c.get('intent') == 'price_enquiry'
    and _parse_time('Ude 9 ta damu') == '09:00'
    and _parse_date('Heya 10 am') is not None
    and is_exact_confirm('Book')
    and is_price_rejection('mama keewe price aka newei')
)
print('PHASE6_RC6_AI_OK' if ok else 'PHASE6_RC6_AI_FAIL', json.dumps({{
    'units': len(units), 'bad': bad.ok, 'good': good.ok, 'intent': c.get('intent')
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
if (checks.some(v => !v)) {{ console.log('PHASE6_RC6_WORKER_FAIL', checks); process.exit(2); }}
console.log('PHASE6_RC6_WORKER_OK', JSON.stringify(checks));
"
docker compose ps ai_engine ai_crm_worker backend
""",
        120,
    )
    evidence["verify"] = verify[-2500:]
    ok = "PHASE6_RC6_AI_OK" in verify and "PHASE6_RC6_WORKER_OK" in verify
    evidence["ok"] = ok
    evidence["finished_utc"] = datetime.now(timezone.utc).isoformat()
    OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")

    try:
        manifest["production_status"] = "DEPLOYED" if ok else "DEPLOY_FAILED"
        manifest["deployed_utc"] = evidence["finished_utc"]
        (RC / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        (RC / "DEPLOY_ORDER.txt").write_text(
            "PHASE 6 RC6 — Advanced Intelligent Receptionist\n"
            f"Status: {'DEPLOYED' if ok else 'DEPLOY_FAILED'} ({evidence['finished_utc']})\n"
            "WhatsApp: NOT SENT\n",
            encoding="utf-8",
        )
    except Exception as exc:
        evidence["manifest_update_error"] = str(exc)

    REPORT.write_text(
        "# Phase 6 RC6 Deployment Execution Report — Larvendo T28\n\n"
        f"**RC:** `phase6_t28_rc6`\n"
        f"**Approval:** `all commit and deploy`\n"
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
        f"Evidence JSON: `_scripts/_phase6_rc6_deploy_evidence.json`\n",
        encoding="utf-8",
    )

    client.close()
    print(json.dumps({"ok": ok, "out": str(OUT), "report": str(REPORT)}, indent=2))
    return 0 if ok else 4


if __name__ == "__main__":
    raise SystemExit(main())
