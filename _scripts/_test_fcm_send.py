import paramiko, sys, io

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

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

cmd = r"""
cd /root/xanesalon
docker compose exec -T backend node -e "
var fcm = require('./services/fcmService');
var m   = require('./models');
m.StaffFcmToken.findAll().then(function(rows) {
  if (!rows.length) { console.log('No tokens found'); process.exit(1); }
  var token = rows[0].fcm_token;
  console.log('Sending test to token:', token.substring(0,25));
  return fcm.sendToToken(token, 'Test Notification', 'FCM is working! Appointment reminders ready.', {type:'test'});
}).then(function(){ console.log('Done'); process.exit(0); })
  .catch(function(e){ console.error(e.message); process.exit(1); });
"
"""

stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
stdin.close()
print(stdout.read().decode("utf-8", errors="replace"))
client.close()
