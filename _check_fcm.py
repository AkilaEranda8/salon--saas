import paramiko, sys, io

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

passwords = ["qnuwjheuweugdsjsds", "kjsdksdjiereihshdks"]
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in passwords:
    try:
        client.connect("157.180.113.249", port=22, username="root", password=pw, timeout=15)
        break
    except Exception:
        pass

cmd = r"""
cd /root/xanesalon

echo '=== FIREBASE ENV SET? ==='
docker compose exec -T backend sh -c 'if [ -n "$FIREBASE_SERVICE_ACCOUNT_JSON" ]; then echo YES; else echo NO; fi'

echo '=== FCM TOKENS IN DB ==='
docker compose exec -T backend node -e "
var m = require('./models');
m.StaffFcmToken.findAll().then(function(rows){
  console.log('Total tokens:', rows.length);
  rows.forEach(function(r){ console.log('  user_id:', r.user_id, '| branch_id:', r.branch_id, '| token:', r.fcm_token.substring(0,25)); });
  process.exit(0);
}).catch(function(e){ console.error(e.message); process.exit(1); });
"
"""

stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
stdin.close()
print(stdout.read().decode("utf-8", errors="replace"))
client.close()
