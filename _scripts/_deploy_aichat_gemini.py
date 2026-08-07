"""Deploy AI Chat Gemini connection via CRM AI settings."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
FILES = [
    "ai_bot/llm_client.py",
    "ai_bot/conversation.py",
    "docker-compose.yml",
    "frontend/src/pages/crm/CrmAiSettingsPage.jsx",
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
    "cd /root/xanesalon && docker compose up -d --build aibot frontend",
    timeout=420,
)
print(o.read().decode("utf-8", "replace")[-2500:])
err = e.read().decode("utf-8", "replace")
if err.strip():
    print(err[-1000:])

time.sleep(10)
_, o, _ = client.exec_command(
    "cd /root/xanesalon && docker compose ps aibot frontend && "
    "docker compose exec -T aibot grep -n 'gemini\\|_gemini_complete\\|fetch_tenant_ai_settings' /app/llm_client.py | head -15 && "
    "docker compose logs --tail=15 aibot 2>&1",
    timeout=40,
)
print(o.read().decode("utf-8", "replace")[-3000:])
client.close()
print("done")
