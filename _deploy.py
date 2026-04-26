"""
Deploy to VPS over SSH (Paramiko). Run from repo root:

  pip install paramiko
  python _deploy.py

Optional env:
  DEPLOY_HOST       default 46.62.135.100
  DEPLOY_USER       default root
  DEPLOY_PATH       default /root/xanesalon  (clone dir on server)
  DEPLOY_SSH_PASSWORD  if set, only this password is tried
"""

import io
import os
import sys

# Avoid UnicodeEncodeError on Windows when Docker prints ✓ etc.
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(
        sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True
    )
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(
        sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True
    )

try:
    import paramiko
except ImportError:
    print("Install paramiko first:  pip install paramiko", file=sys.stderr)
    sys.exit(1)

host = os.environ.get("DEPLOY_HOST", "46.62.135.100")
user = os.environ.get("DEPLOY_USER", "root")
app_path = os.environ.get("DEPLOY_PATH", "/root/xanesalon")

# Try env password first, then fallbacks (prefer setting DEPLOY_SSH_PASSWORD locally)
passwords = []
if os.environ.get("DEPLOY_SSH_PASSWORD"):
    passwords.append(os.environ["DEPLOY_SSH_PASSWORD"])
passwords.extend(
    p
    for p in (
        "CCaPfTjhjhjkhgkshds",
        "kjsdksdjiereihshdks",
    )
    if p not in passwords
)

# Do NOT run global `docker stop`/`rm` on all containers — that can hang or break
# other stacks. Only this repo's compose stack is rebuilt below.
deploy_cmd = (
    f"if [ -d /root/zane_salon ] && [ ! -d {app_path} ]; then "
    f"  mv /root/zane_salon {app_path} && echo '>>> Renamed zane_salon -> {app_path}'; "
    "fi && "
    f"if [ ! -d {app_path} ]; then "
    "  git clone https://github.com/AkilaEranda8/salon--saas.git "
    f"{app_path} && echo '>>> Cloned fresh'; "
    "fi && "
    f"cd {app_path} && "
    "echo '>>> git fetch + reset' && "
    "git fetch origin main && "
    "git reset --hard origin/main && "
    "echo '>>> Stop old salon_v1 stack (shared DB volume — must stop before rebuild)' && "
    "if [ -d /root/salon_v1 ]; then cd /root/salon_v1 && docker compose down 2>/dev/null || true && cd {app_path}; fi && "
    f"cd {app_path} && "
    "echo '>>> docker compose down + up --build (may take several minutes)...' && "
    "docker compose down && "
    "DOCKER_BUILDKIT=1 docker compose up -d --build && "
    "echo '>>> Waiting for DB healthy...' && "
    "for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do "
    "  S=$(docker inspect --format='{{.State.Health.Status}}' xanesalon-db-1 2>/dev/null); "
    "  echo \"  DB: $S\"; [ \"$S\" = healthy ] && break; sleep 5; done && "
    "echo '>>> addMissingColumns migration' && "
    "docker compose exec -T backend node scripts/addMissingColumns.js && "
    "echo '>>> ensureSuperadmin' && "
    "docker compose exec -T backend node scripts/ensureSuperadmin.js && "
    "echo '>>> restart proxy' && "
    "docker compose restart proxy && "
    "echo '=== DEPLOY DONE ==='"
)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

connected = False
for password in passwords:
    try:
        client.connect(host, port=22, username=user, password=password, timeout=30)
        print(f"Connected to {user}@{host} (password ok)")
        connected = True
        break
    except paramiko.AuthenticationException:
        print(f"Auth failed (tried ****)")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if not connected:
    print(
        "SSH login failed. Set DEPLOY_SSH_PASSWORD or fix credentials.",
        file=sys.stderr,
    )
    sys.exit(1)

try:
    # Long docker builds: no short timeout on channel
    stdin, stdout, stderr = client.exec_command(deploy_cmd, get_pty=True)
    stdin.close()

    def _copy(stream, out):
        for line in iter(stream.readline, ""):
            out.write(line)
            out.flush()

    import threading

    t_err = threading.Thread(target=_copy, args=(stderr, sys.stderr))
    t_err.daemon = True
    t_err.start()
    _copy(stdout, sys.stdout)
    t_err.join(timeout=1)

    exit_code = stdout.channel.recv_exit_status()
    print(f"\nExit code: {exit_code}", flush=True)
    if exit_code != 0:
        sys.exit(1)
except Exception as e:
    print(f"Error during deploy: {e}", file=sys.stderr)
    sys.exit(1)
finally:
    client.close()
