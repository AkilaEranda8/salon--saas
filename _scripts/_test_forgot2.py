import io, sys, paramiko, time
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

# Trigger forgot-password for superadmin via internal port 5000
cmd = (
    "curl -sk -X POST http://localhost:5000/api/auth/forgot-password "
    "-H 'Content-Type: application/json' "
    "-d '{\"username\":\"superadmin\"}'"
)
_, out, _ = client.exec_command(cmd, timeout=20)
print("API Response:", out.read().decode("utf-8", "replace"))

# Wait 3s then check logs
time.sleep(3)
_, out2, _ = client.exec_command("docker logs xanesalon-backend-1 --tail=10 2>&1", timeout=15)
print("\nLast logs:")
print(out2.read().decode("utf-8", "replace"))
client.close()
