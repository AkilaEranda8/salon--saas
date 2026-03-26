import paramiko, sys

host = '157.180.113.249'
user = 'root'
password = 'qnuwjheuweugdsjsds'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password)

cmd = 'cd /root/xanesalon && docker compose logs backend --tail=60 2>&1'
_, stdout, stderr = client.exec_command(cmd)
output = stdout.read().decode('utf-8', errors='replace')
sys.stdout.buffer.write(output.encode('utf-8'))

client.close()
