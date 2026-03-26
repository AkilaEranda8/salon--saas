import paramiko, sys

host = '157.180.113.249'
user = 'root'

# Try possible passwords
passwords = [
    'qnuwjheuweugdsjsds',
    'kjsdksdjiereihshdks',
]

deploy_cmd = (
    # Rename old dir if it exists, clone fresh if neither exists
    "if [ -d /root/zane_salon ] && [ ! -d /root/xanesalon ]; then "
    "  mv /root/zane_salon /root/xanesalon && echo '>>> Renamed zane_salon -> xanesalon'; "
    "fi && "
    "if [ ! -d /root/xanesalon ]; then "
    "  git clone https://github.com/AkilaEranda8/zane_saloon_.git /root/xanesalon && echo '>>> Cloned fresh'; "
    "fi && "
    # Kill any container using port 5001, then bring everything down cleanly
    "docker ps -q | xargs -r docker stop 2>/dev/null || true && "
    "docker ps -aq | xargs -r docker rm 2>/dev/null || true && "
    "cd /root/xanesalon && "
    "git fetch origin master && "
    "git reset --hard origin/master && "
    "docker compose up -d --build && "
    "docker compose restart proxy && "
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
        print(line, end='', flush=True, file=open(sys.stdout.fileno(), mode='w', encoding='utf-8', errors='replace', closefd=False))
    exit_code = stdout.channel.recv_exit_status()
    print(f'\nExit code: {exit_code}')
    if exit_code != 0:
        sys.exit(1)
except Exception as e:
    print(f'Error during deploy: {e}', file=sys.stderr)
    sys.exit(1)
finally:
    client.close()
