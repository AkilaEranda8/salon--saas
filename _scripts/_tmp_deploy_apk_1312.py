import io, sys, os, time
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(
        sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True
    )
import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
HOST = "46.62.135.100"
apk_local = r"e:\salon_v1\staff_mobile_app\build\app\outputs\flutter-apk\app-release.apk"
ROOT = r"e:\salon_v1"

files = [
    ("backend/routes/staff.js", "/root/xanesalon/backend/routes/staff.js"),
    ("backend/controllers/salonInventoryController.js", "/root/xanesalon/backend/controllers/salonInventoryController.js"),
    ("backend/controllers/salonInventoryOpsController.js", "/root/xanesalon/backend/controllers/salonInventoryOpsController.js"),
    ("backend/services/invStockService.js", "/root/xanesalon/backend/services/invStockService.js"),
    ("frontend/src/pages/inventory/invApi.js", "/root/xanesalon/frontend/src/pages/inventory/invApi.js"),
    ("frontend/src/pages/inventory/InvConsumptionPage.jsx", "/root/xanesalon/frontend/src/pages/inventory/InvConsumptionPage.jsx"),
]

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
sftp = client.open_sftp()

for rel, remote in files:
    local = os.path.join(ROOT, rel.replace("/", os.sep))
    print("put", remote)
    sftp.put(local, remote)

client.exec_command("mkdir -p /root/xanesalon/backend/uploads/apps")
remote_apk = "/root/xanesalon/backend/uploads/apps/hexaone-staff-app.apk"
size = os.path.getsize(apk_local)
print(f"uploading apk {size} bytes...")
last = [0]
t0 = time.time()

def cb(transferred, total):
    if transferred - last[0] >= 5_000_000 or transferred == total:
        last[0] = transferred
        pct = 100.0 * transferred / total if total else 0
        print(f"  {transferred}/{total} ({pct:.1f}%) {time.time()-t0:.0f}s")

sftp.put(apk_local, remote_apk, callback=cb)
client.exec_command(
    "cp -f /root/xanesalon/backend/uploads/apps/hexaone-staff-app.apk "
    "/root/xanesalon/backend/uploads/apps/hexaone-staff-app-1.3.12.apk"
)
print("apk done")
sftp.close()

cmd = r"""
set -e
cd /root/xanesalon
NAME=$(docker compose ps -q backend | head -1)
echo container=$NAME
docker cp backend/routes/staff.js "$NAME":/app/routes/staff.js
docker cp backend/controllers/salonInventoryController.js "$NAME":/app/controllers/salonInventoryController.js
docker cp backend/controllers/salonInventoryOpsController.js "$NAME":/app/controllers/salonInventoryOpsController.js
docker cp backend/services/invStockService.js "$NAME":/app/services/invStockService.js
docker exec "$NAME" mkdir -p /app/uploads/apps
docker cp backend/uploads/apps/hexaone-staff-app.apk "$NAME":/app/uploads/apps/hexaone-staff-app.apk
FNAME=$(docker compose ps -q frontend 2>/dev/null | head -1 || true)
if [ -n "$FNAME" ]; then
  docker cp frontend/src/pages/inventory/invApi.js "$FNAME":/app/src/pages/inventory/invApi.js 2>/dev/null || true
  docker cp frontend/src/pages/inventory/InvConsumptionPage.jsx "$FNAME":/app/src/pages/inventory/InvConsumptionPage.jsx 2>/dev/null || true
fi
docker compose restart backend
sleep 4
ls -la backend/uploads/apps/hexaone-staff-app.apk
grep -n "STAFF_APP_VERSION" backend/routes/staff.js | head -1
echo DONE
"""
_, o, e = client.exec_command(cmd, timeout=180)
print(o.read().decode("utf-8", "replace")[-4000:])
err = e.read().decode("utf-8", "replace")
if err.strip():
    print("ERR", err[-2000:])
client.close()
print("ALL DONE")
