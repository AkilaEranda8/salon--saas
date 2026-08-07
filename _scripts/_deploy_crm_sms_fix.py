"""Hotfix CRM appointment SMS notify onto production backend."""
import io, sys
from pathlib import Path
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
LOCAL = Path(r"e:\salon_v1\backend\controllers\crmIntegrationController.js")
REMOTE = "/root/xanesalon/backend/controllers/crmIntegrationController.js"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in PASSWORDS:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        print("SSH ok")
        break
    except Exception as e:
        print("auth fail", e)
        continue
else:
    sys.exit(1)

sftp = client.open_sftp()
sftp.put(str(LOCAL), REMOTE)
sftp.put(str(LOCAL), "/tmp/crmIntegrationController.js")
sftp.close()
print("uploaded")

cmds = [
    "docker cp /tmp/crmIntegrationController.js xanesalon-backend-1:/app/controllers/crmIntegrationController.js",
    "cd /root/xanesalon && docker compose restart backend",
]
for c in cmds:
    print(">>>", c)
    _, o, e = client.exec_command(c, timeout=120)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out.strip()[-1500:])
    if err.strip():
        print(err.strip()[-800:])

_, o, e = client.exec_command(
    "cd /root/xanesalon && docker compose ps backend && "
    "docker compose logs --tail=20 backend 2>&1 | tail -20",
    timeout=60,
)
print(o.read().decode("utf-8", "replace")[-2000:])
client.close()
print("done")
