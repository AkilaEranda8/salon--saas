"""Redeploy CRM salon notification wiring to production."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
LOCAL = Path(r"e:\salon_v1\backend\controllers\crmIntegrationController.js")
HOST = "/root/xanesalon/backend/controllers/crmIntegrationController.js"

text = LOCAL.read_text(encoding="utf-8")
if "notifyAppointmentConfirmed" not in text or "salon notifications queued" not in text:
    print("LOCAL FILE incomplete — abort")
    sys.exit(1)
print("local ok, bytes=", LOCAL.stat().st_size)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in PASSWORDS:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        print("SSH ok")
        break
    except Exception as e:
        print("auth", e)
else:
    sys.exit(1)

sftp = client.open_sftp()
sftp.put(str(LOCAL), HOST)
sftp.put(str(LOCAL), "/tmp/crmIntegrationController.js")
sftp.close()
print("uploaded")

def run(cmd, timeout=120):
    print(">>>", cmd)
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out[-2000:])
    if err.strip():
        print(err[-800:])
    return out

run("docker cp /tmp/crmIntegrationController.js xanesalon-backend-1:/app/controllers/crmIntegrationController.js")
run("cd /root/xanesalon && docker compose restart backend")
time.sleep(12)
run(
    "cd /root/xanesalon && "
    "docker compose exec -T backend grep -n 'notifyAppointmentConfirmed\\|salon notifications queued' /app/controllers/crmIntegrationController.js && "
    "docker compose exec -T backend sed -n '627,665p' /app/controllers/crmIntegrationController.js && "
    "docker compose ps backend"
)
client.close()
print("done")
