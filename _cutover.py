"""
Cutover: stop salon_v1 stack, start xanesalon stack with the same DB volume.
"""
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
    "echo '>>> [1/5] Stopping old salon_v1 stack...' && "
    "cd /root/salon_v1 && docker compose down && "
    "echo '>>> [2/5] Starting xanesalon stack...' && "
    "cd /root/xanesalon && docker compose up -d && "
    "echo '>>> [3/5] Waiting for DB to become healthy (up to 3 min)...' && "
    "for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35; do "
    "  STATUS=$(docker inspect --format='{{.State.Health.Status}}' xanesalon-db-1 2>/dev/null); "
    "  echo \"  [$i] DB: $STATUS\"; "
    "  [ \"$STATUS\" = \"healthy\" ] && break; "
    "  sleep 5; "
    "done && "
    "echo '>>> [4/5] Running migrations...' && "
    "docker compose exec -T backend node scripts/addMissingColumns.js && "
    "docker compose exec -T backend node scripts/ensureSuperadmin.js && "
    "echo '>>> [5/5] Restarting proxy...' && "
    "docker compose restart proxy && "
    "echo && echo '>>> Final status:' && "
    "docker compose ps && "
    "echo && echo '=== CUTOVER COMPLETE ==='"
)

stdin, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=480)
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
