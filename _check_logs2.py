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

_, out, _ = client.exec_command('docker logs zane_salon-backend-1 --tail 100 2>&1', timeout=30)
print(out.read().decode('utf-8', errors='replace'))
client.close()
