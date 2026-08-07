import io, sys, threading
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        print("Connected"); break
    except paramiko.AuthenticationException: pass

cmd = (
    "cd /root/xanesalon && "
    "echo '>>> addMissingColumns...' && "
    "docker compose exec -T backend node scripts/addMissingColumns.js && "
    "echo '>>> ensureSuperadmin...' && "
    "docker compose exec -T backend node scripts/ensureSuperadmin.js && "
    "echo '>>> proxy restart...' && "
    "docker compose restart proxy && "
    "echo && docker compose ps && "
    "echo '=== DONE ==='"
)
stdin, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=120)
stdin.close()
def copy_e():
    for l in iter(stderr.readline, ""): sys.stderr.write(l); sys.stderr.flush()
threading.Thread(target=copy_e, daemon=True).start()
for line in iter(stdout.readline, ""): sys.stdout.write(line); sys.stdout.flush()
code = stdout.channel.recv_exit_status()
print(f"\nExit: {code}")
client.close()
