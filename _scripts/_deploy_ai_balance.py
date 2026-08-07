"""Deploy AI credit balance feature to production."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
FILES = [
    ("backend/models/AiCreditEntry.js", "/root/xanesalon/backend/models/AiCreditEntry.js"),
    ("backend/models/index.js", "/root/xanesalon/backend/models/index.js"),
    ("backend/controllers/crmAnalyticsController.js", "/root/xanesalon/backend/controllers/crmAnalyticsController.js"),
    ("backend/routes/crm.js", "/root/xanesalon/backend/routes/crm.js"),
    ("backend/services/ensureAiCrmSchema.js", "/root/xanesalon/backend/services/ensureAiCrmSchema.js"),
    ("frontend/src/pages/crm/CrmAiCostPage.jsx", "/root/xanesalon/frontend/src/pages/crm/CrmAiCostPage.jsx"),
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
for rel, remote in FILES:
    local = ROOT / rel
    print("put", rel)
    # ensure remote dir
    remote_dir = "/".join(remote.split("/")[:-1])
    try:
        sftp.stat(remote_dir)
    except IOError:
        pass
    sftp.put(str(local), remote)
    sftp.put(str(local), f"/tmp/{Path(rel).name}")
sftp.close()

def run(cmd, timeout=300):
    print(">>>", cmd[:180])
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out[-2500:])
    if err.strip():
        print(err[-1000:])
    return out

# copy into running containers + rebuild frontend if needed
run(
    "docker cp /tmp/AiCreditEntry.js xanesalon-backend-1:/app/models/AiCreditEntry.js && "
    "docker cp /root/xanesalon/backend/models/index.js xanesalon-backend-1:/app/models/index.js && "
    "docker cp /tmp/crmAnalyticsController.js xanesalon-backend-1:/app/controllers/crmAnalyticsController.js && "
    "docker cp /root/xanesalon/backend/routes/crm.js xanesalon-backend-1:/app/routes/crm.js && "
    "docker cp /root/xanesalon/backend/services/ensureAiCrmSchema.js xanesalon-backend-1:/app/services/ensureAiCrmSchema.js"
)

# Check frontend service name
run("cd /root/xanesalon && docker compose ps --format json 2>/dev/null | head -c 2000; docker compose ps")

# Restart backend so sequelize.sync creates ai_credit_entries
run("cd /root/xanesalon && docker compose restart backend")
time.sleep(15)

# Rebuild frontend if there is a frontend service that builds from source
run(
    "cd /root/xanesalon && "
    "if docker compose ps --services | grep -q '^frontend$'; then "
    "  docker compose up -d --build frontend; "
    "elif docker compose ps --services | grep -q nginx; then "
    "  ls frontend/dist 2>/dev/null | head; "
    "  if [ -f frontend/package.json ]; then "
    "    docker run --rm -v /root/xanesalon/frontend:/app -w /app node:20-alpine sh -c 'npm ci --omit=dev 2>/dev/null || npm install; npm run build'; "
    "  fi; "
    "fi; "
    "docker compose ps"
)

time.sleep(5)
run(
    "cd /root/xanesalon && "
    "docker compose exec -T backend node -e \"require('./models'); console.log('AiCreditEntry', !!require('./models').AiCreditEntry);\" && "
    "docker compose logs --tail=40 backend 2>&1 | grep -iE 'error|ai_credit|started|sync' | tail -20"
)

client.close()
print("done")
