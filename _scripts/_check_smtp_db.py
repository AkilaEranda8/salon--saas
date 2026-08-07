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

cmd = (
    "docker exec xanesalon-db-1 psql -U postgres -d zanesalon -c "
    "\"SELECT id, tenant_id, branch_id, smtp_host, smtp_port, smtp_user, smtp_from, "
    "LEFT(smtp_pass,8) as smtp_pass_prefix, length(smtp_pass) as smtp_pass_len "
    "FROM notification_settings WHERE tenant_id IS NULL AND branch_id IS NULL LIMIT 5;\""
)
_, out, err = client.exec_command(cmd, timeout=30)
print("STDOUT:", out.read().decode("utf-8", "replace"))
print("STDERR:", err.read().decode("utf-8", "replace"))
client.close()
