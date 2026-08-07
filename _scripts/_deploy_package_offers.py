"""Deploy package offers + WhatsApp AI live offers."""
import io, sys, time
from pathlib import Path

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import paramiko

PASSWORDS = ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]
ROOT = Path(r"e:\salon_v1")
FILES = [
    "backend/models/Package.js",
    "backend/controllers/packageController.js",
    "backend/controllers/crmIntegrationController.js",
    "ai_engine/app/main.py",
    "frontend/src/pages/PackagesPage.jsx",
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

def run(cmd, timeout=700):
    print(">>>", cmd[:240])
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace")
    if out.strip():
        print(out[-3500:])
    if err.strip():
        print(err[-1500:])
    return out

run("cd /root/xanesalon && docker compose up -d --build backend ai_engine frontend")
time.sleep(20)
run(
    "cd /root/xanesalon && "
    "docker compose exec -T backend node -e \"(async()=>{const {Package}=require('./models'); await Package.sync({alter:true}); const a=Object.keys(Package.rawAttributes); console.log('cols', a.filter(k=>/offer|show_as/.test(k))); process.exit(0);})().catch(e=>{console.error(e); process.exit(1);})\" && "
    "docker compose exec -T ai_engine sh -c 'grep -n \"CURRENT SALON OFFERS\\|list_promotions\\|offer_intent\" /app/app/main.py | head -20' && "
    "docker compose exec -T frontend sh -c 'grep -c \"Customer offer\\|show_as_offer\" /usr/share/nginx/html/assets/*.js || true' && "
    "docker compose ps backend ai_engine frontend"
)
client.close()
print("done")
