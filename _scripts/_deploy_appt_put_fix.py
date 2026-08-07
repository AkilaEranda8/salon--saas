"""Deploy appointment PUT status-400 fix."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
FILES = [
    "backend/controllers/appointmentController.js",
    "frontend/src/pages/AppointmentsPage.jsx",
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
    print("put", rel)
    sftp.put(str(ROOT / rel), f"/root/xanesalon/{rel}")
sftp.close()

def run(cmd, timeout=600):
    print(">>>", cmd[:200])
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out[-2500:])
    if err.strip():
        print(err[-800:])
    return out

run("cd /root/xanesalon && docker compose up -d --build backend frontend")
time.sleep(18)
run(
    "cd /root/xanesalon && "
    "docker compose exec -T backend grep -n 'unchanged\\|Use PATCH' /app/controllers/appointmentController.js | head -10 && "
    "docker compose ps backend frontend"
)
client.close()
print("done")
