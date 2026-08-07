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

DBPASS = "1c048a4cbac66ebaf69e30fda9ecd863"

cmd = (
    f"docker exec xanesalon-db-1 mysql -u root -p'{DBPASS}' -h 127.0.0.1 zanesalon -e "
    "\"SELECT id, username, email, role, tenant_id FROM users WHERE role='platform_admin' OR username='superadmin' LIMIT 10;\""
    " 2>&1"
)
_, out, _ = client.exec_command(cmd, timeout=30)
print(out.read().decode("utf-8", "replace"))
client.close()
