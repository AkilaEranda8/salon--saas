"""Resume deploy: start all xanesalon containers and run migrations."""
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
    except paramiko.AuthenticationException:
        pass

cmd = (
    "cd /root/xanesalon && "
    "echo '>>> Starting all containers...' && "
    "docker compose up -d && "
    "echo '>>> Waiting for DB healthy (up to 3min)...' && "
    "for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35; do "
    "  STATUS=$(docker inspect --format='{{.State.Health.Status}}' xanesalon-db-1 2>/dev/null); "
    "  echo \"[$i] DB health: $STATUS\"; "
    "  [ \"$STATUS\" = \"healthy\" ] && break; "
    "  sleep 5; "
    "done && "
    "echo '>>> Running migrations...' && "
    "docker compose exec -T backend node scripts/addMissingColumns.js && "
    "echo '>>> ensureSuperadmin...' && "
    "docker compose exec -T backend node scripts/ensureSuperadmin.js && "
    "echo '>>> Restarting proxy...' && "
    "docker compose restart proxy && "
    "echo '>>> Final container status:' && "
    "docker compose ps && "
    "echo '=== DEPLOY DONE ==='"
)

stdin, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=420)
stdin.close()

def copy_err():
    for line in iter(stderr.readline, ""):
        sys.stderr.write(line); sys.stderr.flush()

t = threading.Thread(target=copy_err, daemon=True)
t.start()
for line in iter(stdout.readline, ""):
    sys.stdout.write(line); sys.stdout.flush()
t.join(1)

code = stdout.channel.recv_exit_status()
print(f"\nExit code: {code}")
client.close()
if code != 0:
    sys.exit(1)
