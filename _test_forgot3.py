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

DBPASS = "1c048a4cbac66ebaf69e30fda9ecd863"

# Check if email was set by migration
cmd1 = (
    f"docker exec xanesalon-db-1 mysql -u root -p'{DBPASS}' -h 127.0.0.1 zanesalon -e "
    "\"SELECT id, username, email, role FROM users WHERE role IN ('platform_admin','superadmin') LIMIT 10;\" 2>&1"
)
_, out, _ = client.exec_command(cmd1, timeout=20)
print("=== Users ===")
print(out.read().decode("utf-8", "replace"))

# Trigger forgot-password via external port 5001
cmd2 = (
    "curl -s -X POST http://localhost:5001/api/auth/forgot-password "
    "-H 'Content-Type: application/json' "
    "-d '{\"username\":\"superadmin\"}'"
)
_, out2, _ = client.exec_command(cmd2, timeout=20)
print("=== API Response ===")
print(out2.read().decode("utf-8", "replace"))

time.sleep(4)
_, out3, _ = client.exec_command("docker logs xanesalon-backend-1 --tail=5 2>&1", timeout=15)
print("\n=== Last 5 backend logs ===")
print(out3.read().decode("utf-8", "replace"))
client.close()
