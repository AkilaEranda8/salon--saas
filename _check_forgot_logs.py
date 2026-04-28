import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for pw in ['CCaPfTjhjhjkhgkshds', 'kjsdksdjiereihshdks']:
    try:
        client.connect('46.62.135.100', username='root', password=pw, timeout=20)
        break
    except Exception:
        pass

_, out, _ = client.exec_command('docker logs xanesalon-backend-1 2>&1 | grep -iE "forgot|resetPassword|500" | tail -20', timeout=30)
print('=== BACKEND ===')
print(out.read().decode('utf-8', 'replace'))

_, out2, _ = client.exec_command('docker logs xanesalon-frontend-1 2>&1 | tail -10', timeout=30)
print('=== FRONTEND nginx ===')
print(out2.read().decode('utf-8', 'replace'))

client.close()
