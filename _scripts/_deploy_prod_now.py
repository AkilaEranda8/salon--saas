"""Deploy main branch to production after git push."""
import io, sys, threading

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

SERVER_IP = "46.62.135.100"
SERVER_USER = "root"
APP_DIR = "/root/xanesalon"
GIT_BRANCH = "main"
PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
connected = False
for pw in PASSWORDS:
    try:
        client.connect(SERVER_IP, username=SERVER_USER, password=pw, timeout=20)
        print("SSH connected")
        connected = True
        break
    except paramiko.AuthenticationException:
        continue
if not connected:
    print("SSH auth failed", file=sys.stderr)
    sys.exit(1)

remote = " && ".join([
    f"cd {APP_DIR}",
    "echo '>>> git pull'",
    f"git pull origin {GIT_BRANCH}",
    "echo '>>> docker compose up --build'",
    "docker compose up -d --build",
    "echo '>>> waiting for DB...'",
    (
        "for i in $(seq 1 24); do "
        "  S=$(docker inspect --format='{{.State.Health.Status}}' "
        "      $(docker compose ps -q db 2>/dev/null) 2>/dev/null || echo unknown); "
        "  echo \"  DB: $S\"; "
        "  [ \"$S\" = \"healthy\" ] && break; sleep 5; "
        "done"
    ),
    "echo '>>> post-deploy scripts'",
    "docker compose exec -T backend node scripts/addMissingColumns.js || true",
    "docker compose exec -T backend node scripts/ensureSuperadmin.js  || true",
    "docker compose restart proxy || true",
    "docker compose ps",
    "echo 'DEPLOY COMPLETE'",
])

_, stdout, stderr = client.exec_command(remote, get_pty=True, timeout=900)

def _err():
    for line in iter(stderr.readline, ""):
        sys.stderr.write(line)
        sys.stderr.flush()

threading.Thread(target=_err, daemon=True).start()
for line in iter(stdout.readline, ""):
    sys.stdout.write(line)
    sys.stdout.flush()

code = stdout.channel.recv_exit_status()
client.close()
if code != 0:
    print(f"Deploy failed exit {code}", file=sys.stderr)
    sys.exit(code)
print("OK")
