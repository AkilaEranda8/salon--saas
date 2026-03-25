"""
SSL Setup Script for xanesalon.com
Step 1: Switch to HTTP-only nginx config
Step 2: Run certbot to get SSL certificates
Step 3: Restore full SSL config
"""
import paramiko, sys, time

HOST = '157.180.113.249'
USER = 'root'
PASSWORDS = ['qnuwjheuweugdsjsds', 'kjsdksdjiereihshdks']
EMAIL = 'akilaeranda8@gmail.com'
DOMAIN = 'zanesalon.com'

HTTP_CONF = """server {
  listen 80;
  server_name xanesalon.com www.xanesalon.com main.xanesalon.com api.xanesalon.com pma.xanesalon.com;

  location /.well-known/acme-challenge/ {
    root /var/www/certbot;
  }

  location / {
    return 200 'SSL setup in progress...';
    add_header Content-Type text/plain;
  }
}

server {
  listen 80 default_server;
  server_name _;

  location /.well-known/acme-challenge/ {
    root /var/www/certbot;
  }

  location / {
    proxy_pass http://website:80;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
"""

def ssh_connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    for pw in PASSWORDS:
        try:
            client.connect(HOST, port=22, username=USER, password=pw, timeout=15)
            print(f'Connected to {HOST}')
            return client
        except paramiko.AuthenticationException:
            print(f'Password failed: {pw[:4]}****')
        except Exception as e:
            print(f'Connection error: {e}')
            sys.exit(1)
    print('All passwords failed')
    sys.exit(1)

def run(client, cmd, timeout=120, label=''):
    if label:
        print(f'\n>>> {label}')
    stdin, stdout, stderr = client.exec_command(cmd, get_pty=False, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.strip())
    if err.strip():
        print('[stderr]', err.strip())
    return code

def main():
    client = ssh_connect()

    # ── STEP 1: Write HTTP-only config ──────────────────────────────────────
    print('\n=== STEP 1: Switch to HTTP-only nginx config ===')

    # Backup SSL config
    run(client, 'cp /root/xanesalon/proxy/default.conf /root/xanesalon/proxy/default.conf.ssl_backup 2>/dev/null || true',
        label='Backup SSL config')

    # Write HTTP config via heredoc
    http_cmd = f"""cat > /root/xanesalon/proxy/default.conf << 'ENDOFCONF'
{HTTP_CONF}
ENDOFCONF"""
    run(client, http_cmd, label='Write HTTP-only config')

    # Restart proxy
    code = run(client, 'cd /root/xanesalon && docker compose restart proxy',
               timeout=30, label='Restart proxy with HTTP config')

    time.sleep(3)
    run(client, 'cd /root/xanesalon && docker compose ps proxy', label='Proxy status')

    # ── STEP 2: Run Certbot ─────────────────────────────────────────────────
    print('\n=== STEP 2: Request SSL certificates from Let\'s Encrypt ===')

    certbot_cmd = (
        f'cd /root/xanesalon && '
        f'docker compose --profile certbot run --rm certbot certonly '
        f'--webroot --webroot-path=/var/www/certbot '
        f'--email {EMAIL} --agree-tos --no-eff-email '
        f'-d {DOMAIN} -d www.{DOMAIN} -d main.{DOMAIN} -d api.{DOMAIN} -d pma.{DOMAIN}'
    )
    code = run(client, certbot_cmd, timeout=180, label='Certbot SSL certificate request')

    if code != 0:
        print('\nCertbot failed! Check DNS records are pointing to this server.')
        print(f'Server IP: {HOST}')
        print('Required DNS A records:')
        for sub in ['@', 'www', 'main', 'api', 'pma']:
            print(f'  {sub}.xanesalon.com -> {HOST}')

        # Restore SSL config anyway for next attempt
        run(client, 'cp /root/xanesalon/proxy/default.conf.ssl_backup /root/xanesalon/proxy/default.conf',
            label='Restore SSL config')
        sys.exit(1)

    # ── STEP 3: Restore SSL config & restart ────────────────────────────────
    print('\n=== STEP 3: Restore full SSL nginx config ===')

    run(client, 'cp /root/xanesalon/proxy/default.conf.ssl_backup /root/xanesalon/proxy/default.conf',
        label='Restore SSL config')

    run(client, 'cd /root/xanesalon && docker compose restart proxy',
        timeout=30, label='Restart proxy with SSL config')

    time.sleep(3)
    run(client, 'cd /root/xanesalon && docker compose ps', label='Final container status')

    # ── STEP 4: Setup auto-renewal cron ─────────────────────────────────────
    print('\n=== STEP 4: Setup auto-renewal cron ===')
    cron_cmd = (
        '(crontab -l 2>/dev/null | grep -v certbot; '
        'echo "0 3 * * * cd /root/xanesalon && docker compose --profile certbot run --rm certbot renew --quiet && docker compose exec proxy nginx -s reload") '
        '| crontab -'
    )
    run(client, cron_cmd, label='Install renewal cron job')

    print('\n' + '='*50)
    print('SSL SETUP COMPLETE!')
    print('='*50)
    print(f'  https://zanesalon.com          -> Public Website')
    print(f'  https://www.zanesalon.com      -> Public Website')
    print(f'  https://main.zanesalon.com     -> Management System')
    print(f'  https://api.zanesalon.com      -> Backend API')
    print(f'  https://pma.zanesalon.com      -> phpMyAdmin')
    print('')

    client.close()

if __name__ == '__main__':
    main()
