"""Deploy richer salon AI Chat assistant."""
import io, sys, time
from pathlib import Path
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
import paramiko
PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
FILES = [
    "ai_bot/salon_api.py",
    "ai_bot/conversation.py",
    "ai_bot/llm_client.py",
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
    "cd /root/xanesalon && docker compose up -d --build aibot",
    timeout=300,
)
print(o.read().decode()[-1500:])
print(e.read().decode()[-500:])
time.sleep(8)
_, o, _ = client.exec_command(
    "cd /root/xanesalon && docker compose ps aibot && "
    "docker compose exec -T aibot grep -n 'build_salon_snapshot\\|_staff_open_question\\|Authorization' /app/salon_api.py /app/conversation.py | head -20",
    timeout=30,
)
print(o.read().decode())
client.close()
print("done")
