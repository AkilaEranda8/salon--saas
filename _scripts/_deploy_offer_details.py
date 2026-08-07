"""Deploy AI offer details reply improvement."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in PASSWORDS:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        print("SSH ok")
        break
    except Exception as e:
        print(e)
else:
    sys.exit(1)

sftp = client.open_sftp()
sftp.put(str(ROOT / "ai_engine/app/main.py"), "/root/xanesalon/ai_engine/app/main.py")
sftp.close()
print("put main.py")

def run(cmd, timeout=500):
    print(">>>", cmd[:200])
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out[-2500:])
    if err.strip():
        print(err[-1000:])
    return out

run("cd /root/xanesalon && docker compose up -d --build ai_engine")
time.sleep(12)
run("cd /root/xanesalon && docker compose exec -T ai_engine grep -n note_limit /app/app/main.py | head -5")
run("cd /root/xanesalon && docker compose exec -T ai_engine grep -n 'Customer asked for DETAILS' /app/app/main.py | head -5")
client.close()
print("done")
