"""Deploy advanced AI Knowledge Base (search, seed, import, UI)."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
FILES = [
    "backend/services/knowledgeService.js",
    "backend/controllers/crmKnowledgeController.js",
    "backend/routes/crm.js",
    "frontend/src/pages/crm/CrmKnowledgePage.jsx",
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
        print(out[-3000:])
    if err.strip():
        print(err[-1500:])
    return out

run(
    "cd /root/xanesalon && "
    "docker compose up -d --build backend frontend"
)
time.sleep(18)
run(
    "cd /root/xanesalon && "
    "docker compose exec -T backend grep -n \"seed-defaults\\|bulk-import\\|knowledgeStats\\|SYNONYMS\" "
    "/app/services/knowledgeService.js /app/controllers/crmKnowledgeController.js /app/routes/crm.js | head -40 && "
    "docker compose exec -T frontend sh -c 'grep -c \"Bulk import\\|AI search preview\\|seed-defaults\" /usr/share/nginx/html/assets/*.js || true' && "
    "docker compose ps backend frontend"
)
client.close()
print("done")
