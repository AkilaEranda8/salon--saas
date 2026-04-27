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

# Check appointments table columns
cmd = (
    "cd /root/xanesalon && "
    "DB_PASS=$(grep DB_PASS .env 2>/dev/null | cut -d= -f2 | tr -d '\"' | head -1) && "
    "docker compose exec -T db mysql -u root -p\"$DB_PASS\" zanesalon "
    "-e 'DESCRIBE appointments;' 2>&1"
)
_, out, _ = client.exec_command(cmd, timeout=20)
print(out.read().decode("utf-8", "replace"))
client.close()
