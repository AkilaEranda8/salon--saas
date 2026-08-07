import io, sys
import paramiko

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
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

cmd = (
    "docker compose -f /root/xanesalon/docker-compose.yml exec -T frontend "
    "sh -c \"grep -R -c 'pick an available slot' /usr/share/nginx/html/assets/ || true; "
    "grep -R -c 'Date and time are required' /usr/share/nginx/html/assets/ || true\""
)
_, o, e = client.exec_command(cmd, timeout=30)
print(o.read().decode("utf-8", "replace"))
print(e.read().decode("utf-8", "replace")[-400:])
client.close()
