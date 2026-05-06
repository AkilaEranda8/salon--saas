"""
Deploy script — Hexa Salon (salon_v1)
  1. git add + commit + push  (local)
  2. SSH into VPS → git pull + docker compose up --build
"""
import io, sys, time, subprocess, threading, argparse

# ── stdout / stderr UTF-8 fix (Windows) ────────────────────────────────────
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

try:
    import paramiko
except ImportError:
    print("paramiko not found.  Run:  pip install paramiko", file=sys.stderr)
    sys.exit(1)

# ══════════════════════════════════════════════════════════════════
#  CONFIG — edit these if needed
# ══════════════════════════════════════════════════════════════════
SERVER_IP   = "46.62.135.100"
SERVER_USER = "root"
APP_DIR     = "/root/xanesalon"
GIT_BRANCH  = "main"

# Passwords tried in order (first one that works wins)
PASSWORDS = [
    "CCaPfTjhjhjkhgkshds",
    "kjsdksdjiereihshdks",
]
# ══════════════════════════════════════════════════════════════════

def banner(msg: str):
    w = 54
    print("\n" + "═" * w)
    print(f"  {msg}")
    print("═" * w)

def run_local(cmd: list[str], cwd: str = ".") -> int:
    """Run a local command and stream output. Returns exit code."""
    proc = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True,
                            encoding="utf-8", errors="replace")
    for line in proc.stdout:
        print(line, end="")
    proc.wait()
    return proc.returncode

def ssh_connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    for pw in PASSWORDS:
        try:
            client.connect(SERVER_IP, username=SERVER_USER,
                           password=pw, timeout=20)
            print(f"  ✓ SSH connected ({SERVER_USER}@{SERVER_IP})")
            return client
        except paramiko.AuthenticationException:
            continue
    print(f"  ✗ SSH auth failed — check PASSWORDS in script", file=sys.stderr)
    sys.exit(1)

def ssh_run(client: paramiko.SSHClient, cmd: str, timeout: int = 300):
    """Run a command over SSH and stream output. Returns exit code."""
    _, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=timeout)

    def _drain_err():
        for line in iter(stderr.readline, ""):
            sys.stderr.write(line); sys.stderr.flush()

    t = threading.Thread(target=_drain_err, daemon=True)
    t.start()
    for line in iter(stdout.readline, ""):
        sys.stdout.write(line); sys.stdout.flush()
    t.join(2)
    return stdout.channel.recv_exit_status()


# ── Parse args ─────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Deploy Hexa Salon to VPS")
parser.add_argument("--skip-push",   action="store_true", help="Skip git push (SSH-only deploy)")
parser.add_argument("--skip-build",  action="store_true", help="Skip --build flag on docker compose up")
parser.add_argument("-m", "--message", default="deploy: update", help="Git commit message")
args = parser.parse_args()


# ══════════════════════════════════════════════════════════════════
#  STEP 1 — Local: git push
# ══════════════════════════════════════════════════════════════════
if not args.skip_push:
    banner("STEP 1 — Git push")

    # Stage all changes
    print("\n▸ git add .")
    rc = run_local(["git", "add", "."])
    if rc != 0:
        print("  ✗ git add failed", file=sys.stderr); sys.exit(rc)

    # Commit (allow empty so re-deploys don't fail)
    print(f"\n▸ git commit -m \"{args.message}\"")
    rc = run_local(["git", "commit", "--allow-empty", "-m", args.message])
    if rc != 0:
        print("  ✗ git commit failed", file=sys.stderr); sys.exit(rc)

    # Push
    print(f"\n▸ git push origin {GIT_BRANCH}")
    rc = run_local(["git", "push", "origin", GIT_BRANCH])
    if rc != 0:
        print("  ✗ git push failed", file=sys.stderr); sys.exit(rc)

    print("\n  ✓ Code pushed to GitHub")
else:
    print("\n⚡ Skipping git push (--skip-push)")


# ══════════════════════════════════════════════════════════════════
#  STEP 2 — Remote: pull + build + restart
# ══════════════════════════════════════════════════════════════════
banner("STEP 2 — SSH deploy to VPS")

print(f"\n▸ Connecting to {SERVER_USER}@{SERVER_IP} ...")
client = ssh_connect()

build_flag = "" if args.skip_build else "--build"

remote_cmd = " && ".join([
    f"cd {APP_DIR}",
    f"echo '>>> git pull'",
    f"git pull origin {GIT_BRANCH}",
    f"echo '>>> docker compose down'",
    "docker compose down",
    f"echo '>>> docker compose up -d {build_flag}'",
    f"docker compose up -d {build_flag}",
    "echo '>>> Waiting for DB to become healthy...'",
    # Wait up to 2 min for DB
    (
        "for i in $(seq 1 24); do "
        "  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "
        "           $(docker compose ps -q db) 2>/dev/null || echo unknown); "
        "  echo \"  DB health: $STATUS\"; "
        "  [ \"$STATUS\" = \"healthy\" ] && break; "
        "  sleep 5; "
        "done"
    ),
    "echo '>>> Running post-deploy scripts'",
    "docker compose exec -T backend node scripts/addMissingColumns.js || true",
    "docker compose exec -T backend node scripts/ensureSuperadmin.js  || true",
    "docker compose restart proxy || true",
    "echo ''",
    "docker compose ps",
    "echo ''",
    "echo '════════════════════════════════════════'",
    "echo '  ✓  DEPLOY COMPLETE'",
    "echo '════════════════════════════════════════'",
    "echo '  https://salon.hexalyte.com'",
    "echo '  https://admin.hexalyte.com'",
    "echo '  https://api.salon.hexalyte.com'",
    "echo '  https://pma.hexalyte.com'",
    "echo ''",
])

print()
code = ssh_run(client, remote_cmd, timeout=600)
client.close()

if code != 0:
    print(f"\n✗ Remote deploy failed (exit {code})", file=sys.stderr)
    sys.exit(code)
