import paramiko, sys

host = '157.180.113.249'
user = 'root'
password = 'qnuwjheuweugdsjsds'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password)

def run(label, cmd):
    print(f"\n=== {label} ===")
    sys.stdout.flush()
    _, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    sys.stdout.buffer.write((out + err).encode('utf-8'))
    sys.stdout.buffer.flush()

run(
    "Latest appointments",
    "cd /root/xanesalon && docker compose exec -T db mysql -uroot -pkjsdksdjiereihshdks zanesalon -e \"SELECT id, customer_name, phone, date, time, service_id, status, createdAt FROM appointments ORDER BY id DESC LIMIT 20;\" 2>&1",
)

client.close()
