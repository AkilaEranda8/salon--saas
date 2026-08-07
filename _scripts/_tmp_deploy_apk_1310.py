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
    ("backend/controllers/appointmentController.js", "/root/xanesalon/backend/controllers/appointmentController.js"),
    ("backend/controllers/notificationController.js", "/root/xanesalon/backend/controllers/notificationController.js"),
    ("backend/controllers/paymentController.js", "/root/xanesalon/backend/controllers/paymentController.js"),
    ("backend/models/Appointment.js", "/root/xanesalon/backend/models/Appointment.js"),
    ("backend/models/NotificationLog.js", "/root/xanesalon/backend/models/NotificationLog.js"),
    ("backend/models/NotificationSettings.js", "/root/xanesalon/backend/models/NotificationSettings.js"),
    ("backend/services/ensureAppointmentRecurringSmsColumn.js", "/root/xanesalon/backend/services/ensureAppointmentRecurringSmsColumn.js"),
    ("backend/services/ensureWalkInNotificationColumns.js", "/root/xanesalon/backend/services/ensureWalkInNotificationColumns.js"),
    ("backend/services/notificationService.js", "/root/xanesalon/backend/services/notificationService.js"),
    ("backend/services/recurringService.js", "/root/xanesalon/backend/services/recurringService.js"),
    ("backend/services/recurringSmsCron.js", "/root/xanesalon/backend/services/recurringSmsCron.js"),
    ("frontend/src/pages/AppointmentsPage.jsx", "/root/xanesalon/frontend/src/pages/AppointmentsPage.jsx"),
    ("frontend/src/pages/NotificationsPage.jsx", "/root/xanesalon/frontend/src/pages/NotificationsPage.jsx"),
    ("frontend/src/pages/PaymentsPage.jsx", "/root/xanesalon/frontend/src/pages/PaymentsPage.jsx"),
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
    "/root/xanesalon/backend/uploads/apps/hexaone-staff-app-1.3.10.apk"
)
print("apk done")
sftp.close()

cmd = r"""
set -e
cd /root/xanesalon
NAME=$(docker compose ps -q backend | head -1)
echo container=$NAME
docker cp backend/routes/staff.js "$NAME":/app/routes/staff.js
docker cp backend/controllers/appointmentController.js "$NAME":/app/controllers/appointmentController.js
docker cp backend/controllers/notificationController.js "$NAME":/app/controllers/notificationController.js
docker cp backend/controllers/paymentController.js "$NAME":/app/controllers/paymentController.js
docker cp backend/models/Appointment.js "$NAME":/app/models/Appointment.js
docker cp backend/models/NotificationLog.js "$NAME":/app/models/NotificationLog.js
docker cp backend/models/NotificationSettings.js "$NAME":/app/models/NotificationSettings.js
docker cp backend/services/ensureAppointmentRecurringSmsColumn.js "$NAME":/app/services/ensureAppointmentRecurringSmsColumn.js
docker cp backend/services/ensureWalkInNotificationColumns.js "$NAME":/app/services/ensureWalkInNotificationColumns.js
docker cp backend/services/notificationService.js "$NAME":/app/services/notificationService.js
docker cp backend/services/recurringService.js "$NAME":/app/services/recurringService.js
docker cp backend/services/recurringSmsCron.js "$NAME":/app/services/recurringSmsCron.js
docker exec "$NAME" mkdir -p /app/uploads/apps
docker cp backend/uploads/apps/hexaone-staff-app.apk "$NAME":/app/uploads/apps/hexaone-staff-app.apk
# frontend container if present
FNAME=$(docker compose ps -q frontend 2>/dev/null | head -1 || true)
if [ -n "$FNAME" ]; then
  docker cp frontend/src/pages/AppointmentsPage.jsx "$FNAME":/app/src/pages/AppointmentsPage.jsx 2>/dev/null || true
  docker cp frontend/src/pages/NotificationsPage.jsx "$FNAME":/app/src/pages/NotificationsPage.jsx 2>/dev/null || true
  docker cp frontend/src/pages/PaymentsPage.jsx "$FNAME":/app/src/pages/PaymentsPage.jsx 2>/dev/null || true
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
