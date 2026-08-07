"""Check notification channel flags for tenant 5."""
import io, sys
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
import paramiko
PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
SCRIPT = r'''
process.chdir('/app');
(async () => {
  const { NotificationSetting, CrmFollowUpJob } = require('./models');
  const { getChannelFlags } = require('./services/notificationService');
  const flags = await getChannelFlags(5);
  console.log('flags', flags);
  try {
    const s = await NotificationSetting.findOne({ where: { tenant_id: 5 } });
    console.log('settings', s ? s.toJSON() : null);
  } catch (e) { console.log('settings_err', e.message); }
  try {
    const jobs = await CrmFollowUpJob.findAll({ where: { tenant_id: 5 }, order: [['id','DESC']], limit: 10 });
    for (const j of jobs) console.log(j.toJSON());
  } catch (e) { console.log('jobs_err', e.message); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
'''
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in PASSWORDS:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=20)
        break
    except Exception:
        continue
sftp = client.open_sftp()
with sftp.file('/tmp/check_flags.js','w') as f: f.write(SCRIPT)
sftp.close()
_,o,e=client.exec_command(
  "docker cp /tmp/check_flags.js xanesalon-backend-1:/app/check_flags.js && "
  "docker compose -f /root/xanesalon/docker-compose.yml exec -T -w /app backend node check_flags.js",
  timeout=40,
)
print(o.read().decode('utf-8','replace'))
print(e.read().decode('utf-8','replace')[-800:])
client.close()
