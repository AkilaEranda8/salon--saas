"""Upload staff APK 1.3.28 to production web download path."""
import io, sys, os, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(
        sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True
    )

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
HOST = "46.62.135.100"
ROOT = Path(r"e:\salon_v1")
APK = ROOT / "staff_mobile_app" / "build" / "app" / "outputs" / "flutter-apk" / "app-release.apk"
STAFF_JS = ROOT / "backend" / "routes" / "staff.js"

if not APK.exists():
    print("APK missing:", APK)
    sys.exit(1)

print("APK size MB", round(APK.stat().st_size / (1024 * 1024), 2))

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in PASSWORDS:
    try:
        client.connect(HOST, username="root", password=pw, timeout=30, banner_timeout=60)
        print("SSH ok")
        break
    except Exception as e:
        print("fail", e)
else:
    sys.exit(1)

transport = client.get_transport()
transport.set_keepalive(30)

def run(cmd, timeout=600):
    print(">>>", cmd[:220])
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out[-3000:])
    if err.strip():
        print("ERR", err[-800:])
    return out

run("mkdir -p /root/xanesalon/backend/uploads/apps /root/xanesalon/backend/assets")

sftp = client.open_sftp()
print("put staff.js")
sftp.put(str(STAFF_JS), "/root/xanesalon/backend/routes/staff.js")

remote_apk = "/root/xanesalon/backend/uploads/apps/hexaone-staff-app.apk"
size = APK.stat().st_size
print(f"uploading apk {size} bytes...")
last = [0]
t0 = time.time()

def cb(transferred, total):
    if transferred - last[0] >= 5_000_000 or transferred == total:
        last[0] = transferred
        pct = 100.0 * transferred / total if total else 0
        print(f"  {transferred}/{total} ({pct:.1f}%) {time.time()-t0:.0f}s")

sftp.put(str(APK), remote_apk, callback=cb)
print("copy assets fallback")
run(
    "cp -f /root/xanesalon/backend/uploads/apps/hexaone-staff-app.apk "
    "/root/xanesalon/backend/assets/hexaone-staff-app.apk && "
    "cp -f /root/xanesalon/backend/uploads/apps/hexaone-staff-app.apk "
    "/root/xanesalon/backend/uploads/apps/hexaone-staff-app-1.3.28.apk"
)
sftp.close()
print("apk uploaded")

run("ls -lh /root/xanesalon/backend/uploads/apps/hexaone-staff-app.apk /root/xanesalon/backend/assets/hexaone-staff-app.apk")

cmd = r"""
set -e
cd /root/xanesalon
NAME=$(docker compose ps -q backend | head -1)
echo container=$NAME
docker cp backend/routes/staff.js "$NAME":/app/routes/staff.js
docker exec "$NAME" mkdir -p /app/uploads/apps /app/assets
docker cp backend/uploads/apps/hexaone-staff-app.apk "$NAME":/app/uploads/apps/hexaone-staff-app.apk
docker cp backend/uploads/apps/hexaone-staff-app.apk "$NAME":/app/assets/hexaone-staff-app.apk
docker compose restart backend
sleep 5
ls -lh backend/uploads/apps/hexaone-staff-app.apk
grep -n "STAFF_APP_VERSION" backend/routes/staff.js | head -1
docker compose exec -T backend sh -c 'grep -n STAFF_APP_VERSION /app/routes/staff.js | head -1; ls -lh /app/uploads/apps/hexaone-staff-app.apk'
echo DONE
"""
_, o, e = client.exec_command(cmd, timeout=300)
print(o.read().decode("utf-8", "replace")[-4000:])
err = e.read().decode("utf-8", "replace")
if err.strip():
    print("ERR", err[-2000:])
client.close()
print("ALL DONE")
