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
_, o, _ = client.exec_command(
    "grep -n 'addAiCreditTopup\\|module.exports' /root/xanesalon/backend/controllers/crmAnalyticsController.js | tail -20; "
    "echo '---'; sed -n '32,40p' /root/xanesalon/backend/routes/crm.js",
    timeout=20,
)
print(o.read().decode())
client.close()
