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
    "cd /root/xanesalon && docker compose logs --tail=80 backend 2>&1",
    timeout=40,
)
print(o.read().decode("utf-8", "replace")[-5000:])
client.close()
