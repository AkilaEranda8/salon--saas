"""
Quick Deploy — Hexaone
Run:  python _quick_deploy.py
"""
import io, sys, subprocess, threading

# UTF-8 fix for Windows
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

try:
    import paramiko
except ImportError:
    print("Installing paramiko...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "-q"])
    import paramiko

# ── CONFIG ─────────────────────────────────────────────────────────
SERVER_IP   = "46.62.135.100"
SERVER_USER = "root"
APP_DIR     = "/root/xanesalon"
GIT_BRANCH  = "main"
PASSWORDS   = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
# ───────────────────────────────────────────────────────────────────

def sep(title):
    print(f"\n{'═'*52}")
    print(f"  {title}")
    print('═'*52)

# ══ STEP 1: Local git push ═════════════════════════════════════════
sep("STEP 1 — git push")

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.stdout.strip(): print(r.stdout.strip())
    if r.stderr.strip(): print(r.stderr.strip())
    return r.returncode

print("\n▸ git add .")
run("git add .")

print("\n▸ git commit")
run('git commit --allow-empty -m "Add privacy policy page for Play Store"')

print(f"\n▸ git push origin {GIT_BRANCH}")
rc = run(f"git push origin {GIT_BRANCH}")
if rc != 0:
    print("✗ git push failed — check your credentials / remote", file=sys.stderr)
    sys.exit(rc)

print("\n  ✓ Pushed to GitHub")

# ══ STEP 2: SSH → server deploy ════════════════════════════════════
sep(f"STEP 2 — SSH deploy  ({SERVER_USER}@{SERVER_IP})")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
connected = False
for pw in PASSWORDS:
    try:
        client.connect(SERVER_IP, username=SERVER_USER, password=pw, timeout=20)
        print(f"  ✓ SSH connected")
        connected = True
        break
    except paramiko.AuthenticationException:
        continue

if not connected:
    print("✗ SSH auth failed — update PASSWORDS in script", file=sys.stderr)
    sys.exit(1)

remote = " && ".join([
    f"cd {APP_DIR}",
    f"echo '>>> git pull'",
    f"git pull origin {GIT_BRANCH}",
    "echo '>>> docker compose down'",
    "docker compose down",
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
    "echo ''",
    "docker compose ps",
    "echo ''",
    "echo '════════════════════════════════════════'",
    "echo '  ✓  DEPLOY COMPLETE'",
    "echo '  https://salon.hexalyte.com'",
    "echo '  https://salon.hexalyte.com/privacy-policy'",
    "echo '════════════════════════════════════════'",
])

_, stdout, stderr = client.exec_command(remote, get_pty=True, timeout=600)

def _err():
    for line in iter(stderr.readline, ""):
        sys.stderr.write(line); sys.stderr.flush()

threading.Thread(target=_err, daemon=True).start()
for line in iter(stdout.readline, ""):
    sys.stdout.write(line); sys.stdout.flush()

code = stdout.channel.recv_exit_status()
client.close()

if code != 0:
    print(f"\n✗ Deploy failed (exit {code})", file=sys.stderr)
    sys.exit(code)
