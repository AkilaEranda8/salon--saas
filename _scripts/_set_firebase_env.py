import json, paramiko, sys, io, os

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

# Load service account JSON from environment variable FIREBASE_SA_JSON
# (never hardcode credentials in source — set the env var locally or via CI)
sa_json_str = os.environ.get("FIREBASE_SA_JSON", "")
if not sa_json_str:
    print("ERROR: FIREBASE_SA_JSON env var not set.", file=sys.stderr)
    sys.exit(1)
SA = json.loads(sa_json_str)

sa_json = json.dumps(SA, separators=(",", ":"))
env_line = f"FIREBASE_SERVICE_ACCOUNT_JSON={sa_json}"

# ── 1. Update local backend/.env ────────────────────────────────────────────
local_env = os.path.join(os.path.dirname(__file__), "backend", ".env")
if os.path.exists(local_env):
    with open(local_env, "r", encoding="utf-8") as f:
        lines = f.readlines()
    lines = [l for l in lines if not l.startswith("FIREBASE_SERVICE_ACCOUNT_JSON=")]
    lines.append("\n" + env_line + "\n")
    with open(local_env, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("✓ Local backend/.env updated")
else:
    print("⚠ Local backend/.env not found — skipping local update")

# ── 2. Update server .env + restart backend ─────────────────────────────────
passwords = ["qnuwjheuweugdsjsds", "kjsdksdjiereihshdks"]
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in passwords:
    try:
        client.connect("157.180.113.249", port=22, username="root", password=pw, timeout=15)
        print("✓ SSH connected")
        break
    except Exception:
        pass

# Remove old line and append new one
escaped = sa_json.replace("'", "'\\''")
cmd = f"""
cd /root/xanesalon
sed -i '/^FIREBASE_SERVICE_ACCOUNT_JSON=/d' .env
echo 'FIREBASE_SERVICE_ACCOUNT_JSON={escaped}' >> .env
echo '>>> .env updated'
grep -c FIREBASE_SERVICE_ACCOUNT_JSON .env && echo 'line present'
docker compose restart backend
echo '>>> backend restarted'
sleep 4
docker compose logs backend --tail=20
"""

stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
stdin.close()
print(stdout.read().decode("utf-8", errors="replace"))
client.close()
