#!/usr/bin/env python3
import io
import sys
import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=30)
        print("Connected")
        break
    except paramiko.AuthenticationException:
        continue

cmd = r"""
cd /root/xanesalon
DBPASS=$(grep -E '^DB_PASS=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
docker compose exec -T db mysql -uroot -p"$DBPASS" zanesalon -e "
SELECT id, event_type, channel, phone, LEFT(message_preview,80) preview, status, createdAt
FROM notification_logs
WHERE tenant_id=28
ORDER BY id DESC
LIMIT 25;

SELECT id, customer_name, phone, notes, status, date, time, createdAt
FROM appointments
WHERE tenant_id=28
ORDER BY id DESC
LIMIT 10;

SELECT appt_confirmed_sms, appt_confirmed_whatsapp, staff_appt_assigned_whatsapp
FROM notification_settings WHERE tenant_id=28 LIMIT 1;
" 2>/dev/null | grep -v Warning
"""
_, stdout, _ = client.exec_command(cmd, get_pty=True, timeout=60)
print(stdout.read().decode("utf-8", errors="replace"))
client.close()
