"""Read-only: compare local deploy candidates vs production container hashes/imports."""
import hashlib
import io
import sys
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
FILES = [
    "ai_engine/app/main.py",
    "ai_engine/app/booking_flow.py",
    "ai_engine/app/pricing_resolver.py",
]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in PASSWORDS:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        print("SSH ok")
        break
    except Exception as e:
        print(e)
else:
    sys.exit(1)


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


print("LOCAL HASHES")
for rel in FILES:
    p = ROOT / rel
    print(rel, "exists" if p.exists() else "MISSING", sha(p) if p.exists() else "-")

cmd = r"""
cd /root/xanesalon && docker compose ps ai_engine &&
docker compose exec -T ai_engine python - <<'PY'
import hashlib, pathlib, os
paths = [
  '/app/app/main.py',
  '/app/app/booking_flow.py',
  '/app/app/pricing_resolver.py',
]
for p in paths:
  path = pathlib.Path(p)
  if not path.exists():
    print(p, 'MISSING')
    continue
  h = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
  print(p, 'bytes', path.stat().st_size, 'sha', h)
# import smoke
try:
  import app.main as m
  print('import_main_ok', hasattr(m, '_maybe_pricing_resolver_reply'))
except Exception as e:
  print('import_main', type(e).__name__, e)
try:
  import app.pricing_resolver as pr
  print('import_pricing_ok', True)
except Exception as e:
  print('import_pricing', type(e).__name__, e)
# env presence (names only)
for k in ['GEMINI_API_KEY','OPENAI_API_KEY','CRM_SERVICE_SECRET','AI_ENGINE_SERVICE_SECRET','SALON_API_BASE','BACKEND_INTERNAL_URL']:
  print('env', k, 'SET' if os.environ.get(k) else 'UNSET')
PY
# KB check T28
docker compose exec -T backend node -e "
const {CrmKnowledgeArticle}=require('/app/models');
(async()=>{
  const rows=await CrmKnowledgeArticle.findAll({where:{tenant_id:28,id:[27,28]},attributes:['id','title','priority','body']});
  for (const r of rows){
    const b=String(r.body||'');
    const line=(b.match(/Ladies Hair Cut[^\\n]*/i)||[null])[0];
    console.log(JSON.stringify({id:r.id,priority:r.priority,ladies:line,has75:/75\\s*min/i.test(line||''),has45:/45\\s*min/i.test(line||'')}));
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
"
# backup/disk hints
ls -lah /root/xanesalon/backups 2>/dev/null | tail -n 5 || echo 'no /root/xanesalon/backups'
ls -lah /var/backups 2>/dev/null | tail -n 3 || true
df -h / | tail -n 1
"""

_, o, e = client.exec_command(cmd, timeout=120)
print((o.read() + e.read()).decode("utf-8", "replace")[-8000:])
client.close()
