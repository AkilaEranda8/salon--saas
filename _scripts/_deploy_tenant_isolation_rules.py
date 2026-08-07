"""Deploy tenant-isolated AI rules hardening."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
FILES = [
    "backend/controllers/crmRulesController.js",
    "ai_engine/app/main.py",
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
    sftp.put(str(ROOT / rel), f"/root/xanesalon/{rel}")
    print("put", rel)
sftp.close()

_, o, e = client.exec_command(
    "cd /root/xanesalon && docker compose up -d --build backend ai_engine frontend",
    timeout=420,
)
print(o.read().decode("utf-8", "replace")[-2000:])
err = e.read().decode("utf-8", "replace")
if err.strip():
    print(err[-800:])
time.sleep(12)
_, o, _ = client.exec_command(
    "cd /root/xanesalon && docker compose ps backend ai_engine frontend && "
    "docker compose exec -T backend grep -n 'requireTenantId\\|tenant_scoped\\|Ignore any' /app/controllers/crmRulesController.js | head -10 && "
    "docker compose exec -T ai_engine grep -n 'TENANT ISOLATION' /app/app/main.py | head -3",
    timeout=40,
)
print(o.read().decode("utf-8", "replace"))
client.close()
print("done")
