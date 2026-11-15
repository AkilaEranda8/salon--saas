"""Read-only: production container file hashes for deploy package (no secrets)."""
from __future__ import annotations

import hashlib
import io
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
OUT = ROOT / "_scripts" / "_phase4_prod_hashes.json"

LOCAL = [
    "ai_engine/app/pricing_resolver.py",
    "ai_engine/app/main.py",
    "ai_engine/app/booking_flow.py",
    "ai_engine/app/conversation_intelligence.py",
    "backend/services/crmInboundTurnService.js",
    "backend/services/crmAiMemoryService.js",
]

# Paths inside containers
REMOTE_AI = {
    "ai_engine/app/pricing_resolver.py": "/app/app/pricing_resolver.py",
    "ai_engine/app/main.py": "/app/app/main.py",
    "ai_engine/app/booking_flow.py": "/app/app/booking_flow.py",
    "ai_engine/app/conversation_intelligence.py": "/app/app/conversation_intelligence.py",
}
REMOTE_BE = {
    "backend/services/crmInboundTurnService.js": "/app/services/crmInboundTurnService.js",
    "backend/services/crmAiMemoryService.js": "/app/services/crmAiMemoryService.js",
}


def sha16(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def main() -> int:
    local = {}
    for rel in LOCAL:
        p = ROOT / rel
        local[rel] = {"exists": p.exists(), "sha16": sha16(p.read_bytes()) if p.exists() else None, "bytes": p.stat().st_size if p.exists() else 0}

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ok = False
    for pw in PASSWORDS:
        try:
            client.connect("46.62.135.100", username="root", password=pw, timeout=20)
            ok = True
            break
        except Exception as e:
            last = str(e)[:80]
    if not ok:
        OUT.write_text(json.dumps({"local": local, "prod": None, "error": "ssh_failed"}, indent=2), encoding="utf-8")
        print(json.dumps({"ssh": False, "out": str(OUT)}))
        return 1

    # Hash AI engine files
    ai_paths = " ".join(REMOTE_AI.values())
    cmd_ai = f"""cd /root/xanesalon && docker compose exec -T ai_engine python - <<'PY'
import hashlib, pathlib, json
paths = {list(REMOTE_AI.values())!r}
out = {{}}
for p in paths:
    fp = pathlib.Path(p)
    if not fp.exists():
        out[p] = {{"exists": False}}
        continue
    b = fp.read_bytes()
    out[p] = {{"exists": True, "sha16": hashlib.sha256(b).hexdigest()[:16], "bytes": len(b)}}
print(json.dumps(out))
PY"""
    _, stdout, stderr = client.exec_command(cmd_ai, timeout=60)
    ai_out = (stdout.read() or b"").decode("utf-8", errors="replace")
    ai_err = (stderr.read() or b"").decode("utf-8", errors="replace")

    cmd_be = f"""cd /root/xanesalon && docker compose exec -T backend node -e "const fs=require('fs');const c=require('crypto');const paths={list(REMOTE_BE.values())!r};const out={{}};for (const p of paths){{if(!fs.existsSync(p)){{out[p]={{exists:false}};continue;}}const b=fs.readFileSync(p);out[p]={{exists:true,sha16:c.createHash('sha256').update(b).digest('hex').slice(0,16),bytes:b.length}};}} console.log(JSON.stringify(out));" """
    _, stdout2, stderr2 = client.exec_command(cmd_be, timeout=60)
    be_out = (stdout2.read() or b"").decode("utf-8", errors="replace")
    be_err = (stderr2.read() or b"").decode("utf-8", errors="replace")

    # worker copy of JS if present
    cmd_w = f"""cd /root/xanesalon && docker compose exec -T ai_crm_worker node -e "const fs=require('fs');const c=require('crypto');const paths={list(REMOTE_BE.values())!r};const out={{}};for (const p of paths){{if(!fs.existsSync(p)){{out[p]={{exists:false}};continue;}}const b=fs.readFileSync(p);out[p]={{exists:true,sha16:c.createHash('sha256').update(b).digest('hex').slice(0,16),bytes:b.length}};}} console.log(JSON.stringify(out));" 2>/dev/null || echo '{{}}'"""
    _, stdout3, _ = client.exec_command(cmd_w, timeout=60)
    w_out = (stdout3.read() or b"").decode("utf-8", errors="replace")

    client.close()

    def parse_json_blob(s: str):
        s = s.strip()
        i = s.find("{")
        j = s.rfind("}")
        if i >= 0 and j > i:
            try:
                return json.loads(s[i : j + 1])
            except Exception:
                return {"raw": s[:300]}
        return {"raw": s[:300], "err": True}

    prod = {
        "ai_engine": parse_json_blob(ai_out),
        "backend": parse_json_blob(be_out),
        "ai_crm_worker": parse_json_blob(w_out),
        "stderr_ai": ai_err[:200],
        "stderr_be": be_err[:200],
    }
    report = {"local": local, "prod": prod, "mapping": {"ai": REMOTE_AI, "backend": REMOTE_BE}}
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ssh": True, "out": str(OUT), "local_files": len(local)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
