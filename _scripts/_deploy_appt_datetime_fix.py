"""Deploy Appointments date/time validation fix."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")

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
sftp.put(str(ROOT / "frontend/src/pages/AppointmentsPage.jsx"), "/root/xanesalon/frontend/src/pages/AppointmentsPage.jsx")
sftp.close()
print("put AppointmentsPage.jsx")

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

run("cd /root/xanesalon && docker compose up -d --build frontend")
time.sleep(12)
run("cd /root/xanesalon && docker compose exec -T frontend sh -c 'grep -c normalizeApptTime /usr/share/nginx/html/assets/*.js || true'")
run("cd /root/xanesalon && docker compose ps frontend")
client.close()
print("done")
