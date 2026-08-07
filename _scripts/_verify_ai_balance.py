"""Verify AI credit + CRM notify still present after rebuild."""
import io, sys
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
import paramiko
PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in PASSWORDS:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        break
    except Exception:
        continue

_, o, _ = client.exec_command(
    "cd /root/xanesalon; "
    "echo '=== notify in image ==='; "
    "docker compose exec -T backend grep -c notifyAppointmentConfirmed /app/controllers/crmIntegrationController.js || true; "
    "echo '=== credit routes ==='; "
    "docker compose exec -T backend grep -n ai-credits /app/routes/crm.js; "
    "echo '=== table ==='; "
    "docker compose exec -T backend node -e \"(async()=>{const {sequelize,AiCreditEntry}=require('./models'); await sequelize.sync(); const [r]=await sequelize.query(\\\"SHOW TABLES LIKE 'ai_credit_entries'\\\"); console.log(r); process.exit(0);})().catch(e=>{console.error(e);process.exit(1);})\"; "
    "echo '=== frontend asset ==='; "
    "docker compose exec -T frontend sh -c \"grep -l prepaid /usr/share/nginx/html/assets/*.js 2>/dev/null | head -3 || grep -R -l 'Record top-up' /usr/share/nginx/html 2>/dev/null | head -3 || ls /usr/share/nginx/html/assets | head\"",
    timeout=60,
)
print(o.read().decode("utf-8", "replace"))
client.close()
