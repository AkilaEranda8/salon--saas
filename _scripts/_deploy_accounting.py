import io
import sys

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(
        sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True
    )

import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in ["CCaPfTjhjhjkhgkshds", "kjsdksdjiereihshdks"]:
    try:
        client.connect("46.62.135.100", username="root", password=pw, timeout=30)
        print("Connected")
        break
    except paramiko.AuthenticationException:
        continue

cmd = r"""
set -e
cd /root/xanesalon
echo '=== git ==='
git fetch origin main
git reset --hard origin/main
echo HEAD=$(git rev-parse --short HEAD)
git log -1 --oneline

echo '=== rebuild backend frontend ==='
docker compose up -d --build backend frontend
echo '=== restart proxy ==='
docker compose restart proxy || true

echo '=== status ==='
docker compose ps --format 'table {{.Name}}\t{{.Status}}' | head -20
sleep 5
echo '=== health ==='
curl -s -o /dev/null -w 'proxy_health %{http_code} %{time_total}s\n' https://127.0.0.1/api/health -k || \
  curl -s -o /dev/null -w 'proxy_health %{http_code} %{time_total}s\n' http://127.0.0.1/api/health

echo '=== accounting module present ==='
docker exec xanesalon-backend-1 node -e "const e=require('./services/accountingEngine'); console.log('engine', typeof e.postJournal, typeof e.ensureTenantBooks); const m=require('./models'); console.log('models', !!(m.AcctAccount&&m.AcctJournal));"
docker exec xanesalon-backend-1 node tests/accountingEngine.test.js | tail -5
"""
_, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=600)
print(stdout.read().decode("utf-8", "replace")[-8000:])
err = stderr.read().decode("utf-8", "replace")
if err.strip():
    print("STDERR", err[-1500:])
client.close()
print("DONE")
