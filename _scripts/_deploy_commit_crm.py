"""Deploy latest CRM AI commit to production."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
FILES = [
    "ai_bot/conversation.py",
    "ai_bot/llm_client.py",
    "ai_bot/salon_api.py",
    "ai_engine/app/main.py",
    "ai_engine/app/tenant_rules.py",
    "backend/controllers/crmAnalyticsController.js",
    "backend/controllers/crmIntegrationController.js",
    "backend/controllers/crmKnowledgeController.js",
    "backend/controllers/crmRulesController.js",
    "backend/controllers/packageController.js",
    "backend/models/Package.js",
    "backend/models/AiCreditEntry.js",
    "backend/models/CrmAiRule.js",
    "backend/models/index.js",
    "backend/routes/crm.js",
    "backend/services/crmInboundTurnService.js",
    "backend/services/crmRulesService.js",
    "backend/services/ensureAiCrmSchema.js",
    "backend/services/knowledgeService.js",
    "docker-compose.yml",
    "frontend/src/App.jsx",
    "frontend/src/components/layout/Sidebar.jsx",
    "frontend/src/components/layout/Topbar.jsx",
    "frontend/src/pages/PackagesPage.jsx",
    "frontend/src/pages/crm/CrmAiCostPage.jsx",
    "frontend/src/pages/crm/CrmAiSettingsPage.jsx",
    "frontend/src/pages/crm/CrmKnowledgePage.jsx",
    "frontend/src/pages/crm/CrmRulesPage.jsx",
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
    if not local.exists():
        print("MISSING", rel)
        continue
    remote = f"/root/xanesalon/{rel.replace(chr(92), '/')}"
    # ensure remote dir
    remote_dir = "/".join(remote.split("/")[:-1])
    try:
        sftp.stat(remote_dir)
    except IOError:
        client.exec_command(f"mkdir -p {remote_dir}")
        time.sleep(0.2)
    print("put", rel)
    sftp.put(str(local), remote)
sftp.close()

def run(cmd, timeout=700):
    print(">>>", cmd[:220])
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out[-3000:])
    if err.strip():
        print(err[-1200:])
    return out

run(
    "cd /root/xanesalon && "
    "docker compose up -d --build backend ai_engine frontend aibot"
)
time.sleep(22)
run(
    "cd /root/xanesalon && "
    "docker compose exec -T backend node -e \"(async()=>{const m=require('./models'); await m.Package.sync({alter:true}); if(m.CrmAiRule) await m.CrmAiRule.sync(); if(m.AiCreditEntry) await m.AiCreditEntry.sync(); console.log('schema ok'); process.exit(0);})().catch(e=>{console.error(e); process.exit(1);})\" && "
    "docker compose ps backend ai_engine frontend aibot"
)
client.close()
print("done")
