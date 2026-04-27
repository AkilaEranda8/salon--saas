"""Investigate and fix the ibdata1 lock conflict."""
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

# Step 1: check volume mounts
cmd_check = (
    "echo '=== Docker volumes ===' && docker volume ls | grep -E 'db|salon' && "
    "echo '=== xanesalon docker-compose volumes ===' && "
    "grep -A5 'db:' /root/xanesalon/docker-compose.yml || true && "
    "echo '=== salon_v1 docker-compose volumes ===' && "
    "grep -A5 'db:' /root/salon_v1/docker-compose.yml 2>/dev/null || true && "
    "echo '=== inspect xanesalon-db-1 mounts ===' && "
    "docker inspect xanesalon-db-1 --format '{{json .Mounts}}' 2>/dev/null && "
    "echo '=== inspect salon_v1-db-1 mounts ===' && "
    "docker inspect salon_v1-db-1 --format '{{json .Mounts}}' 2>/dev/null"
)
_, out, _ = client.exec_command(cmd_check, timeout=30)
result = out.read().decode("utf-8", "replace")
print(result)

# Check if they share the same volume
import json
# Simple text search to detect shared volume
if "salon_v1_db" in result and "xanesalon_db" not in result:
    print("\n>>> Both stacks may share the same volume name! Fixing...")
    # Stop old salon_v1 stack first to release lock, then restart xanesalon
    fix_cmd = (
        "echo '>>> Stopping xanesalon stack...' && "
        "cd /root/xanesalon && docker compose stop db && "
        "echo '>>> Stopping salon_v1 stack DB...' && "
        "cd /root/salon_v1 && docker compose stop db 2>/dev/null || true && sleep 3 && "
        "echo '>>> Starting xanesalon DB...' && "
        "cd /root/xanesalon && docker compose up -d db && "
        "echo '>>> Waiting 30s for DB...' && sleep 30 && "
        "docker inspect --format='{{.State.Health.Status}}' xanesalon-db-1"
    )
    stdin2, out2, err2 = client.exec_command(fix_cmd, get_pty=True, timeout=120)
    stdin2.close()
    def copy_e():
        for l in iter(err2.readline, ""): sys.stderr.write(l); sys.stderr.flush()
    threading.Thread(target=copy_e, daemon=True).start()
    for line in iter(out2.readline, ""):
        sys.stdout.write(line); sys.stdout.flush()
else:
    print("\n>>> Volumes appear separate. Checking if same host path is used...")
    # Try force-remove ibdata1 lock and restart db
    fix_cmd = (
        "cd /root/xanesalon && "
        "echo '>>> Force stop DB container...' && "
        "docker compose stop db && docker compose rm -f db && "
        "echo '>>> Remove ib_logfile* and ibdata lock artifacts...' && "
        "VOLPATH=$(docker volume inspect xanesalon_db-data --format '{{.Mountpoint}}' 2>/dev/null) && "
        "echo \"Volume path: $VOLPATH\" && "
        "ls $VOLPATH 2>/dev/null | head -20 && "
        "echo '>>> Restarting DB...' && "
        "docker compose up -d db && "
        "sleep 30 && "
        "docker inspect --format='{{.State.Health.Status}}' xanesalon-db-1 2>/dev/null && "
        "echo done"
    )
    stdin2, out2, err2 = client.exec_command(fix_cmd, get_pty=True, timeout=120)
    stdin2.close()
    def copy_e():
        for l in iter(err2.readline, ""): sys.stderr.write(l); sys.stderr.flush()
    threading.Thread(target=copy_e, daemon=True).start()
    for line in iter(out2.readline, ""):
        sys.stdout.write(line); sys.stdout.flush()

client.close()
