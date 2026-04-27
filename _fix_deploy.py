"""Waits for DB to become healthy then starts remaining services."""
import io, sys, time, threading

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

try:
    import paramiko
except ImportError:
    print("pip install paramiko", file=sys.stderr); sys.exit(1)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        print(f"Connected (password ok)")
        break
    except paramiko.AuthenticationException:
        pass

cmd = (
    "cd /root/xanesalon && "
    "echo '>>> Waiting for DB healthy...' && "
    "for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do "
    "  STATUS=$(docker inspect --format='{{.State.Health.Status}}' xanesalon-db-1 2>/dev/null); "
    "  echo \"DB health: $STATUS\"; "
    "  [ \"$STATUS\" = \"healthy\" ] && break; "
    "  sleep 5; "
    "done && "
    "echo '>>> docker compose up -d (start remaining)...' && "
    "docker compose up -d && "
    "sleep 5 && "
    "echo '>>> addMissingColumns' && "
    "docker compose exec -T backend node scripts/addMissingColumns.js && "
    "echo '>>> ensureSuperadmin' && "
    "docker compose exec -T backend node scripts/ensureSuperadmin.js && "
    "docker compose restart proxy && "
    "echo '=== DEPLOY DONE ==='"
)

stdin, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=300)
stdin.close()

def _copy_err():
    for line in iter(stderr.readline, ""):
        sys.stderr.write(line); sys.stderr.flush()

t = threading.Thread(target=_copy_err, daemon=True)
t.start()
for line in iter(stdout.readline, ""):
    sys.stdout.write(line); sys.stdout.flush()
t.join(1)

code = stdout.channel.recv_exit_status()
print(f"\nExit code: {code}")
client.close()
if code != 0:
    sys.exit(1)
