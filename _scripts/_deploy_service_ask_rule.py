"""Deploy service-listing rule + AI behavior."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
FILES = [
    "backend/controllers/crmRulesController.js",
    "ai_engine/app/main.py",
    "ai_bot/conversation.py",
]

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
for rel in FILES:
    local = ROOT / rel
    remote = f"/root/xanesalon/{rel.replace(chr(92), '/')}"
    print("put", rel)
    sftp.put(str(local), remote)
sftp.close()

def run(cmd, timeout=600):
    print(">>>", cmd[:220])
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out[-2800:])
    if err.strip():
        print(err[-1000:])
    return out

run("cd /root/xanesalon && docker compose up -d --build backend ai_engine aibot")
time.sleep(18)
# Seed the new rule for all tenants that already have any rules (or tenant 5)
run(
    r"""cd /root/xanesalon && docker compose exec -T backend node -e "(async()=>{
  const { CrmAiRule, sequelize } = require('./models');
  await sequelize.authenticate();
  const title = 'Ask before listing all services';
  const body = 'When a customer asks about services or prices, do NOT dump the full service catalogue. First ask what kind of service they need (e.g. haircut, colour, facial, bridal, nails). Then show ONLY matching services with prices. Send the complete list ONLY if they clearly ask for \"all services\", \"full list\", \"okkom\", or \"සියලු සේවා\". If their need is unclear, ask a short clarifying question instead of listing everything.';
  const [tenants] = await sequelize.query('SELECT DISTINCT tenant_id FROM crm_ai_rules WHERE tenant_id IS NOT NULL');
  let ids = tenants.map(t => t.tenant_id);
  if (!ids.length) ids = [5];
  if (!ids.includes(5)) ids.push(5);
  let created = 0;
  for (const tid of ids) {
    const exists = await CrmAiRule.findOne({ where: { tenant_id: tid, title } });
    if (exists) { console.log('exists', tid); continue; }
    await CrmAiRule.create({ tenant_id: tid, title, category: 'behavior', priority: 108, body, is_active: true });
    created++;
    console.log('created', tid);
  }
  console.log('done created', created);
  process.exit(0);
})().catch(e=>{console.error(e); process.exit(1);})"
"""
)
run(
    "cd /root/xanesalon && "
    "docker compose exec -T ai_engine grep -n 'SERVICE LISTING RULE\\|SERVICE INQUIRY\\|want_all_services' /app/app/main.py | head -15 && "
    "docker compose exec -T aibot grep -n '_ask_service_type\\|all services' /app/conversation.py | head -15 && "
    "docker compose ps backend ai_engine aibot"
)
client.close()
print("done")
