"""Rebuild frontend after removing top-up forms."""
import io, sys, time
from pathlib import Path
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
import paramiko
PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
LOCAL = Path(r"e:\salon_v1\frontend\src\pages\crm\CrmAiCostPage.jsx")
REMOTE = "/root/xanesalon/frontend/src/pages/crm/CrmAiCostPage.jsx"
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
sftp.put(str(LOCAL), REMOTE)
sftp.close()
print("uploaded")
_, o, e = client.exec_command(
    "cd /root/xanesalon && docker compose up -d --build frontend",
    timeout=300,
)
print(o.read().decode("utf-8", "replace")[-2000:])
err = e.read().decode("utf-8", "replace")
if err.strip():
    print(err[-800:])
time.sleep(3)
_, o, _ = client.exec_command(
    "docker compose -f /root/xanesalon/docker-compose.yml exec -T frontend sh -c "
    "\"grep -c 'Record top-up' /usr/share/nginx/html/assets/*.js || true; "
    "grep -c 'Remaining balance' /usr/share/nginx/html/assets/*.js || true\"",
    timeout=30,
)
print("verify:", o.read().decode())
client.close()
print("done")
