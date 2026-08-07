"""
_run_deploy_sh.py
  1. git push (local)
  2. SSH into server
  3. Upload deploy.sh  →  /root/deploy.sh
  4. Run it on the server (bash /root/deploy.sh)
"""
import io, sys, os, subprocess, threading

# ── UTF-8 fix (Windows) ──────────────────────────────────────────────────────
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

# ── Auto-install paramiko ────────────────────────────────────────────────────
try:
    import paramiko
except ImportError:
    print("▸ Installing paramiko...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "-q"])
    import paramiko

# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════════════════════
SERVER_IP   = "46.62.135.100"
SERVER_USER = "root"
APP_DIR     = "/root/xanesalon"
GIT_BRANCH  = "main"
PASSWORDS   = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]

SCRIPT_LOCAL  = os.path.join(os.path.dirname(__file__), "deploy.sh")
SCRIPT_REMOTE = "/root/deploy.sh"
# ══════════════════════════════════════════════════════════════════════════════

def banner(msg):
    print(f"\n{'═'*54}\n  {msg}\n{'═'*54}")

def run_local(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    if r.stdout.strip(): print(r.stdout.strip())
    if r.stderr.strip(): print(r.stderr.strip(), file=sys.stderr)
    return r.returncode

def ssh_connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    for pw in PASSWORDS:
        try:
            c.connect(SERVER_IP, username=SERVER_USER, password=pw, timeout=20)
            print(f"  ✓ SSH connected  ({SERVER_USER}@{SERVER_IP})")
            return c
        except paramiko.AuthenticationException:
            continue
    print("  ✗ SSH auth failed — check PASSWORDS in script", file=sys.stderr)
    sys.exit(1)

def ssh_run(client, cmd, timeout=600):
    _, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=timeout)
    def _err():
        for line in iter(stderr.readline, ""):
            sys.stderr.write(line); sys.stderr.flush()
    threading.Thread(target=_err, daemon=True).start()
    for line in iter(stdout.readline, ""):
        sys.stdout.write(line); sys.stdout.flush()
    return stdout.channel.recv_exit_status()

# ══ STEP 1 — Git push ════════════════════════════════════════════════════════
banner("STEP 1 — git push")
run_local("git add .")
run_local('git commit --allow-empty -m "deploy: privacy policy + website update"')
rc = run_local(f"git push origin {GIT_BRANCH}")
if rc != 0:
    print("✗ git push failed", file=sys.stderr); sys.exit(rc)
print("  ✓ Pushed to GitHub")

# ══ STEP 2 — SSH connect ═════════════════════════════════════════════════════
banner("STEP 2 — SSH connect")
client = ssh_connect()

# ══ STEP 3 — Upload deploy.sh ════════════════════════════════════════════════
banner("STEP 3 — Upload deploy.sh to server")
sftp = client.open_sftp()
sftp.put(SCRIPT_LOCAL, SCRIPT_REMOTE)
sftp.close()
print(f"  ✓ Uploaded  {SCRIPT_LOCAL}  →  {SCRIPT_REMOTE}")

# ══ STEP 4 — Run deploy.sh on server ════════════════════════════════════════
banner(f"STEP 4 — Running deploy.sh on server")
print()

# The deploy.sh clones/pulls the repo and docker compose up --build
# We override APP_DIR so it uses the correct directory name
run_cmd = (
    f"chmod +x {SCRIPT_REMOTE} && "
    f"APP_DIR={APP_DIR} bash {SCRIPT_REMOTE}"
)
code = ssh_run(client, run_cmd, timeout=900)
client.close()

if code != 0:
    print(f"\n✗ deploy.sh failed (exit {code})", file=sys.stderr)
    sys.exit(code)
