"""Upload staff APK 1.3.5 to production web download path."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
APK = ROOT / "staff_mobile_app" / "build" / "app" / "outputs" / "flutter-apk" / "app-release.apk"

if not APK.exists():
    print("APK missing:", APK)
    sys.exit(1)

print("APK size MB", round(APK.stat().st_size / (1024 * 1024), 2))

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

def run(cmd, timeout=600):
    print(">>>", cmd[:220])
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out[-2000:])
    if err.strip():
        print(err[-800:])
    return out

run("mkdir -p /root/xanesalon/backend/uploads/apps /root/xanesalon/backend/assets")

sftp = client.open_sftp()
# versioned route file
sftp.put(str(ROOT / "backend/routes/staff.js"), "/root/xanesalon/backend/routes/staff.js")
print("put staff.js")

remote_apk = "/root/xanesalon/backend/uploads/apps/hexaone-staff-app.apk"
print("uploading apk…")
sftp.put(str(APK), remote_apk)
# also assets fallback
sftp.put(str(APK), "/root/xanesalon/backend/assets/hexaone-staff-app.apk")
sftp.close()
print("apk uploaded")

run("ls -lh /root/xanesalon/backend/uploads/apps/hexaone-staff-app.apk /root/xanesalon/backend/assets/hexaone-staff-app.apk")
run("cd /root/xanesalon && docker compose up -d --build backend")
time.sleep(15)
run(
    "cd /root/xanesalon && "
    "docker compose exec -T backend sh -c '"
    "grep -n STAFF_APP_VERSION /app/routes/staff.js | head -3; "
    "ls -lh /app/uploads/apps/hexaone-staff-app.apk /app/assets/hexaone-staff-app.apk 2>/dev/null || "
    "ls -lh /app/uploads/apps/hexaone-staff-app.apk 2>/dev/null || true"
    "'"
)
# Ensure APK is inside running container volume/bind — docker COPY may not include large apk if dockerignored.
# Copy into container after rebuild.
run(
    "docker cp /root/xanesalon/backend/uploads/apps/hexaone-staff-app.apk "
    "xanesalon-backend-1:/app/uploads/apps/hexaone-staff-app.apk && "
    "docker cp /root/xanesalon/backend/uploads/apps/hexaone-staff-app.apk "
    "xanesalon-backend-1:/app/assets/hexaone-staff-app.apk && "
    "docker compose -f /root/xanesalon/docker-compose.yml exec -T backend "
    "ls -lh /app/uploads/apps/hexaone-staff-app.apk /app/assets/hexaone-staff-app.apk"
)
client.close()
print("done")
