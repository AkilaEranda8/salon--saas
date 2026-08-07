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
_, o, e = client.exec_command(
    "cd /root/xanesalon && docker compose up -d --build ai_crm_worker",
    timeout=300,
)
print(o.read().decode()[-1500:])
print(e.read().decode()[-500:])
time.sleep(8)
_, o, _ = client.exec_command(
    "cd /root/xanesalon && docker compose ps ai_crm_worker backend && "
    "docker compose exec -T ai_crm_worker grep -n rulesBlock /app/services/crmInboundTurnService.js | head -5",
    timeout=40,
)
print(o.read().decode())
client.close()
