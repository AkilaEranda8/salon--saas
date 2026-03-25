import paramiko, sys

host = '157.180.113.249'
user = 'root'

# Try possible passwords
passwords = [
    'qnuwjheuweugdsjsds',
    'kjsdksdjiereihshdks',
]

deploy_cmd = (
    "cd /root/zane_salon && "
    "git pull origin master && "
    "docker compose up -d --build && "
    "echo '=== DEPLOY DONE ==='"
)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

connected = False
for password in passwords:
    try:
        client.connect(host, port=22, username=user, password=password, timeout=10)
        print(f'Connected with password: {password[:4]}****')
        connected = True
        break
    except paramiko.AuthenticationException:
        print(f'Failed: {password[:4]}****')
    except Exception as e:
        print(f'Error: {e}')
        sys.exit(1)

if not connected:
    print('All passwords failed. Please provide the correct SSH root password.')
    sys.exit(1)

try:
    stdin, stdout, stderr = client.exec_command(deploy_cmd, get_pty=True, timeout=300)
    for line in iter(stdout.readline, ''):
        print(line, end='', flush=True)
    exit_code = stdout.channel.recv_exit_status()
    print(f'\nExit code: {exit_code}')
    if exit_code != 0:
        sys.exit(1)
except Exception as e:
    print(f'Error during deploy: {e}', file=sys.stderr)
    sys.exit(1)
finally:
    client.close()
