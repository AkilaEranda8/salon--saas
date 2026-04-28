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

# 1. Set email for all platform_admin and superadmin users that have NULL email
cmd1 = (
    f"docker exec xanesalon-db-1 mysql -u root -p'{DBPASS}' -h 127.0.0.1 zanesalon -e "
    "\"UPDATE users SET email='akilaeranda8@gmail.com' "
    "WHERE username IN ('superadmin','akila','Bhagya','akilaeranda8_1','admin_2') "
    "AND (email IS NULL OR email='');\" 2>&1"
)
_, out, _ = client.exec_command(cmd1, timeout=20)
print("DB update:", out.read().decode("utf-8", "replace"))

# 2. Add SUPERADMIN_EMAIL to server .env
cmd2 = (
    "grep -q 'SUPERADMIN_EMAIL' /root/xanesalon/.env || "
    "echo 'SUPERADMIN_EMAIL=akilaeranda8@gmail.com' >> /root/xanesalon/.env && "
    "echo 'Done' && cat /root/xanesalon/.env"
)
_, out2, _ = client.exec_command(cmd2, timeout=15)
print("Server .env:", out2.read().decode("utf-8", "replace"))

# 3. Verify emails now set
cmd3 = (
    f"docker exec xanesalon-db-1 mysql -u root -p'{DBPASS}' -h 127.0.0.1 zanesalon -e "
    "\"SELECT id, username, email, role FROM users WHERE role IN ('platform_admin','superadmin') LIMIT 10;\" 2>&1"
)
_, out3, _ = client.exec_command(cmd3, timeout=20)
print("Users after fix:", out3.read().decode("utf-8", "replace"))
client.close()
