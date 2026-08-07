"""Deploy CRM AI Rules feature."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
FILES = [
    "backend/models/CrmAiRule.js",
    "backend/models/index.js",
    "backend/controllers/crmRulesController.js",
    "backend/services/crmRulesService.js",
    "backend/services/crmInboundTurnService.js",
    "backend/routes/crm.js",
    "ai_engine/app/main.py",
    "frontend/src/pages/crm/CrmRulesPage.jsx",
    "frontend/src/components/layout/Sidebar.jsx",
    "frontend/src/components/layout/Topbar.jsx",
    "frontend/src/App.jsx",
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
    print(">>>", cmd[:200])
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out[-2500:])
    if err.strip():
        print(err[-1200:])
    return out

# Rebuild backend (sync model), ai_engine (rulesBlock), frontend
run(
    "cd /root/xanesalon && "
    "docker compose up -d --build backend ai_engine frontend"
)
time.sleep(18)
run(
    "cd /root/xanesalon && "
    "docker compose exec -T backend node -e \"(async()=>{const {sequelize}=require('./config/database'); const {CrmAiRule}=require('./models'); await sequelize.authenticate(); await CrmAiRule.sync(); const [t]=await sequelize.query(\\\"SHOW TABLES LIKE 'crm_ai_rules'\\\"); console.log('table', t); console.log('ok'); process.exit(0);})().catch(e=>{console.error(e); process.exit(1);})\" && "
    "docker compose exec -T backend grep -n \"/rules\" /app/routes/crm.js | head -10 && "
    "docker compose exec -T frontend sh -c 'grep -c AI.Rules /usr/share/nginx/html/assets/*.js || true' && "
    "docker compose ps backend ai_engine frontend"
)
client.close()
print("done")
