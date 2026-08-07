import io, sys
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
import paramiko
PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
SCRIPT = r'''
process.chdir('/app');
(async () => {
  const { sequelize } = require('./config/database');
  const { AiCreditEntry } = require('./models');
  await sequelize.authenticate();
  await AiCreditEntry.sync();
  const [tables] = await sequelize.query("SHOW TABLES LIKE 'ai_credit_entries'");
  console.log('tables', JSON.stringify(tables));
  console.log('count', await AiCreditEntry.count());
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
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
with sftp.file('/tmp/check_credit.js', 'w') as f:
    f.write(SCRIPT)
sftp.close()
_, o, e = client.exec_command(
    "docker cp /tmp/check_credit.js xanesalon-backend-1:/app/check_credit.js && "
    "docker compose -f /root/xanesalon/docker-compose.yml exec -T -w /app backend node check_credit.js",
    timeout=40,
)
print(o.read().decode())
print(e.read().decode()[-500:])
client.close()
