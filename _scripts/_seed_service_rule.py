"""Seed Ask-before-listing-all-services rule on production."""
import io, sys
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]

JS = r"""
(async () => {
  const { sequelize } = require('./config/database');
  const { CrmAiRule } = require('./models');
  await sequelize.authenticate();
  const title = 'Ask before listing all services';
  const body = 'When a customer asks about services or prices, do NOT dump the full service catalogue. First ask what kind of service they need (e.g. haircut, colour, facial, bridal, nails). Then show ONLY matching services with prices. Send the complete list ONLY if they clearly ask for "all services", "full list", "okkom", or "සියලු සේවා". If their need is unclear, ask a short clarifying question instead of listing everything.';
  const [tenants] = await sequelize.query('SELECT DISTINCT tenant_id FROM crm_ai_rules WHERE tenant_id IS NOT NULL');
  let ids = tenants.map((t) => t.tenant_id);
  if (!ids.length) ids = [5];
  if (!ids.includes(5)) ids.push(5);
  let created = 0;
  for (const tid of ids) {
    const exists = await CrmAiRule.findOne({ where: { tenant_id: tid, title } });
    if (exists) { console.log('exists', tid); continue; }
    await CrmAiRule.create({
      tenant_id: tid,
      title,
      category: 'behavior',
      priority: 108,
      body,
      is_active: true,
    });
    created += 1;
    console.log('created', tid);
  }
  console.log('done created', created);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
"""

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

sftp = client.open_sftp()
with sftp.file("/tmp/seed_service_rule.js", "w") as f:
    f.write(JS)
sftp.close()

_, o, e = client.exec_command(
    "docker cp /tmp/seed_service_rule.js xanesalon-backend-1:/tmp/seed_service_rule.js && "
    "docker compose -f /root/xanesalon/docker-compose.yml exec -T backend node /tmp/seed_service_rule.js",
    timeout=60,
)
print(o.read().decode("utf-8", "replace"))
err = e.read().decode("utf-8", "replace")
if err.strip():
    print(err[-1000:])
client.close()
print("done")
