import paramiko, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

host = '157.180.113.249'
user = 'root'
passwords = ['qnuwjheuweugdsjsds', 'kjsdksdjiereihshdks']

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

connected = False
for password in passwords:
    try:
        client.connect(host, port=22, username=user, password=password, timeout=10)
        connected = True
        break
    except paramiko.AuthenticationException:
        pass

if not connected:
    print('All passwords failed.')
    sys.exit(1)

sql = "ALTER TABLE appointments ADD COLUMN additional_service_ids TEXT DEFAULT NULL;"
# Get DB_PASS from server .env file first, then run migration
cmd = (
    'DB_PASS=$(grep DB_PASS /root/zane_salon/.env 2>/dev/null | cut -d= -f2 | tr -d \'"\\r\\n\') && '
    'DB_PASS=${DB_PASS:-rootpass} && '
    'DB_NAME=$(grep DB_NAME /root/zane_salon/.env 2>/dev/null | cut -d= -f2 | tr -d \'"\\r\\n\') && '
    'DB_NAME=${DB_NAME:-zanesalon} && '
    'docker exec zane_salon-db-1 mysql -u root -p"$DB_PASS" "$DB_NAME" -e "' + sql + '"'
)
_, stdout, stderr = client.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print('OUT:', out or '(none)')
print('ERR:', err or '(none)')
client.close()
print('=== MIGRATION DONE ===')
