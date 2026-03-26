import json
import paramiko

HOST = "157.180.113.249"
USER = "root"
PASS = "qnuwjheuweugdsjsds"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=15)

cmd = (
    "set -e; "
    "resp=$(curl -sk -X POST https://api.zanesalon.com/api/public/bookings "
    "-H 'Content-Type: application/json' "
    "-d '{\"branch_id\":1,\"service_ids\":[1,2],\"staff_id\":1,"
    "\"customer_name\":\"Multi Test\",\"phone\":\"+94770000000\","
    "\"date\":\"2026-03-28\",\"time\":\"09:00\",\"notes\":\"multi test\"}'); "
    "echo \"$resp\"; "
    "echo '---'; "
    "cd /root/xanesalon && docker compose exec -T db mysql -uroot -pkjsdksdjiereihshdks zanesalon "
    "-e \"SELECT id, customer_name, date, time, service_id, createdAt FROM appointments "
    "WHERE customer_name='Multi Test' ORDER BY id DESC LIMIT 5;\""
)

_, stdout, stderr = client.exec_command(cmd, timeout=40)
print(stdout.read().decode("utf-8", errors="replace"))
print(stderr.read().decode("utf-8", errors="replace"))
client.close()

