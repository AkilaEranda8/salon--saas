"""Verify backend healthy + notify code present."""
import io, sys, time
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
import paramiko
PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in PASSWORDS:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        break
    except Exception:
        continue
time.sleep(8)
_,o,_=client.exec_command(
  "cd /root/xanesalon; "
  "docker compose ps backend; "
  "grep -n 'notifyAppointmentConfirmed' backend/controllers/crmIntegrationController.js | head -5; "
  "docker compose exec -T backend grep -n notifyAppointmentConfirmed /app/controllers/crmIntegrationController.js | head -5; "
  "docker compose logs --tail=30 backend 2>&1 | grep -iE 'listening|started|error|QR|connected|CRM' | tail -20",
  timeout=40,
)
print(o.read().decode('utf-8','replace'))
client.close()
