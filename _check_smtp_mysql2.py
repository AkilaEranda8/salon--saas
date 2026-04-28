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

# Get the actual DB_PASS from the running container env
cmd1 = "docker inspect xanesalon-backend-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E 'DB_PASS|EMAIL'"
_, out, _ = client.exec_command(cmd1, timeout=15)
print("=== Backend env vars ===")
print(out.read().decode("utf-8", "replace"))

# Try mysql with the correct approach  
cmd2 = (
    "DBPASS=$(docker inspect xanesalon-db-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep MYSQL_ROOT_PASSWORD | cut -d= -f2) && "
    "docker exec xanesalon-db-1 mysql -u root -p\"$DBPASS\" -h 127.0.0.1 zanesalon -e "
    "\"SELECT id, tenant_id, branch_id, smtp_host, smtp_port, smtp_user, smtp_from, "
    "LEFT(IFNULL(smtp_pass,''),10) as smtp_pass_start, LENGTH(IFNULL(smtp_pass,'')) as smtp_pass_len "
    "FROM notification_settings WHERE tenant_id IS NULL AND branch_id IS NULL LIMIT 5;\" 2>&1"
)
_, out, _ = client.exec_command(cmd2, timeout=30)
print("=== DB query ===")
print(out.read().decode("utf-8", "replace"))
client.close()
