"""
Test POST /api/appointments and check backend logs for any error.
"""
import io, sys, threading
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20); print("Connected"); break
    except paramiko.AuthenticationException: pass

# Check recent nginx logs for the 500
cmd = (
    "echo '=== Nginx 500 errors ===' && "
    "docker logs xanesalon-proxy-1 2>&1 | grep -E '500|502|503' | tail -10 && "
    "echo && echo '=== Full backend log (recent) ===' && "
    "docker logs xanesalon-backend-1 --tail=200 2>&1 | grep -v 'maintenanceLog' | tail -60"
)
_, out, _ = client.exec_command(cmd, timeout=30)
print(out.read().decode("utf-8", "replace"))
client.close()
