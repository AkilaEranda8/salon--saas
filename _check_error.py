import io, sys
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20); print("Connected"); break
    except paramiko.AuthenticationException: pass

cmd = "docker logs xanesalon-backend-1 --tail=60 2>&1"
_, out, _ = client.exec_command(cmd, timeout=30)
print(out.read().decode("utf-8", "replace"))
client.close()
