"""Deploy mandatory AI rules enforcement."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
FILES = [
    "backend/services/crmRulesService.js",
    "backend/controllers/crmRulesController.js",
    "backend/routes/crm.js",
    "ai_engine/app/main.py",
    "ai_engine/app/tenant_rules.py",
    "frontend/src/pages/crm/CrmRulesPage.jsx",
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

sftp = client.open_sftp()
for rel in FILES:
    local = ROOT / rel
    remote = f"/root/xanesalon/{rel}"
    print("put", rel)
    sftp.put(str(local), remote)
sftp.close()

_, o, e = client.exec_command(
    "cd /root/xanesalon && docker compose up -d --build backend ai_engine ai_crm_worker frontend",
    timeout=420,
)
print(o.read().decode("utf-8", "replace")[-2500:])
err = e.read().decode("utf-8", "replace")
if err.strip():
    print(err[-1000:])

time.sleep(15)
_, o, _ = client.exec_command(
    "cd /root/xanesalon && docker compose ps backend ai_engine ai_crm_worker frontend && "
    "docker compose exec -T backend grep -n getRulesInternal /app/controllers/crmRulesController.js | head -3 && "
    "docker compose exec -T ai_engine grep -n fetch_tenant_rules_block /app/app/main.py | head -5 && "
    "docker compose logs --tail=20 backend 2>&1 | grep -iE 'error|started|listening' | tail -10",
    timeout=40,
)
print(o.read().decode("utf-8", "replace"))
client.close()
print("done")
