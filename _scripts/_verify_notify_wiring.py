"""Confirm production CRM createAppointment has salon notify wiring."""
import io, sys
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
_,o,_=client.exec_command(
  "cd /root/xanesalon; "
  "docker compose exec -T backend sed -n '627,655p' /app/controllers/crmIntegrationController.js; "
  "echo '---'; "
  "docker compose logs --tail=200 backend 2>&1 | grep -iE 'crm-integration|Notifications|appointment notify|SMS' | tail -30",
  timeout=40,
)
print(o.read().decode('utf-8','replace'))
client.close()
