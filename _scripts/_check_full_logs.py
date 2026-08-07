import io, sys, paramiko
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        break
    except paramiko.AuthenticationException:
        pass

# All logs since last restart
print("=== Backend logs since restart ===")
cmd = "docker logs xanesalon-backend-1 --since 10m 2>&1"
_, out, _ = client.exec_command(cmd, timeout=20)
print(out.read().decode("utf-8", "replace"))

# Check nginx access logs for forgot-password hits
print("\n=== Nginx access for /forgot-password ===")
cmd2 = "docker logs xanesalon-proxy-1 --since 10m 2>&1 | grep -i 'forgot\|reset\|password' | tail -20"
_, out2, _ = client.exec_command(cmd2, timeout=20)
print(out2.read().decode("utf-8", "replace") or "(none)")
client.close()
