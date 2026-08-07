"""SSH into server and run: docker compose up -d --build"""
import io, sys, subprocess, threading

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

try:
    import paramiko
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "-q"])
    import paramiko

SERVER_IP   = "46.62.135.100"
SERVER_USER = "root"
APP_DIR     = "/root/xanesalon"
PASSWORDS   = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]

print(f"Connecting to {SERVER_USER}@{SERVER_IP}...")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

for pw in PASSWORDS:
    try:
        client.connect(SERVER_IP, username=SERVER_USER, password=pw, timeout=20)
        print("✓ SSH connected\n")
        break
    except paramiko.AuthenticationException:
        continue
else:
    print("✗ SSH auth failed", file=sys.stderr); sys.exit(1)

cmd = f"cd {APP_DIR} && docker compose up -d --build"
print(f"Running: {cmd}\n{'─'*50}")

_, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=900)

def _err():
    for line in iter(stderr.readline, ""):
        sys.stderr.write(line); sys.stderr.flush()

threading.Thread(target=_err, daemon=True).start()
for line in iter(stdout.readline, ""):
    sys.stdout.write(line); sys.stdout.flush()

code = stdout.channel.recv_exit_status()
client.close()

print(f"\n{'─'*50}")
if code == 0:
    print("✓ docker compose up -d --build — DONE")
    print(f"\n  https://salon.hexalyte.com")
    print(f"  https://salon.hexalyte.com/privacy-policy")
    print(f"  https://admin.hexalyte.com")
else:
    print(f"✗ Failed (exit {code})", file=sys.stderr)
    sys.exit(code)
