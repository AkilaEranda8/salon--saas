import paramiko, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

passwords = ['qnuwjheuweugdsjsds','kjsdksdjiereihshdks']
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pwd in passwords:
    try:
        client.connect('157.180.113.249', port=22, username='root', password=pwd, timeout=10)
        print('Connected')
        break
    except Exception as e:
        print(f'Failed: {e}')

DB_PASS = 'kjsdksdjiereihshdks'
DB_NAME = 'zanesalon'

# Show ALL customer_packages regardless of status
print('\n=== ALL customer packages ===')
_, out, _ = client.exec_command(
    f"docker exec zane_salon-db-1 mysql -uroot -p{DB_PASS} {DB_NAME} "
    f"-e \"SELECT cp.id, cp.customer_id, c.name as customer_name, p.name as package_name, "
    f"cp.sessions_used, cp.sessions_total, (cp.sessions_total - cp.sessions_used) as sessions_remaining, "
    f"cp.status, cp.expiry_date "
    f"FROM customer_packages cp "
    f"JOIN customers c ON c.id=cp.customer_id "
    f"JOIN packages p ON p.id=cp.package_id "
    f"ORDER BY cp.customer_id, cp.id;\" 2>&1",
    timeout=20
)
print(out.read().decode('utf-8', errors='replace'))

client.close()
