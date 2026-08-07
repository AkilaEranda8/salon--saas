import paramiko, sys, io, os

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

new_secret = "HTHJ687478"

# ── 1. Local backend/.env ────────────────────────────────────────────────────
local_env = os.path.join(os.path.dirname(__file__), "backend", ".env")
if os.path.exists(local_env):
    with open(local_env, "r", encoding="utf-8") as f:
        lines = f.readlines()
    lines = [l for l in lines if not l.startswith("JWT_SECRET=")]
    lines.append(f"JWT_SECRET={new_secret}\n")
    with open(local_env, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("✓ Local backend/.env updated")

# ── 2. Server .env + restart ─────────────────────────────────────────────────
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

cmd = f"""
cd /root/xanesalon
sed -i '/^JWT_SECRET=/d' .env
echo 'JWT_SECRET={new_secret}' >> .env
echo '>>> .env updated'
docker compose restart backend
echo '>>> backend restarted'
sleep 4
docker compose logs backend --tail=10
"""

stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
stdin.close()
print(stdout.read().decode("utf-8", errors="replace"))
client.close()
