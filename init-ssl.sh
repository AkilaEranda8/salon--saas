#!/bin/bash
# ── SSL initialization script for zanesalon.com ──────────────────────────────
# Run this ONCE on the VPS to obtain Let's Encrypt certificates.
# After that, a cron job handles auto-renewal.

set -e

DOMAINS="main.zanesalon.com api.zanesalon.com pma.zanesalon.com"
EMAIL="akilaeranda8@gmail.com"
COMPOSE="docker compose"

echo "=== Step 1: Create temporary HTTP-only nginx config ==="
cat > /tmp/default_http.conf << 'HTTPCONF'
server {
    listen 80;
    server_name main.zanesalon.com api.zanesalon.com pma.zanesalon.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'SSL setup in progress...';
        add_header Content-Type text/plain;
    }
}
HTTPCONF

echo "=== Step 2: Stop proxy, copy temp config, restart ==="
$COMPOSE stop proxy
docker cp /tmp/default_http.conf $(${COMPOSE} ps -q proxy 2>/dev/null || true):/etc/nginx/conf.d/default.conf 2>/dev/null || true

# Recreate proxy with temp config mounted
cp proxy/default.conf proxy/default.conf.ssl
cp /tmp/default_http.conf proxy/default.conf
$COMPOSE up -d proxy
sleep 3

echo "=== Step 3: Request certificates ==="
$COMPOSE run --rm --profile certbot certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d main.zanesalon.com \
  -d api.zanesalon.com \
  -d pma.zanesalon.com

echo "=== Step 4: Restore full SSL nginx config ==="
cp proxy/default.conf.ssl proxy/default.conf
rm -f proxy/default.conf.ssl

echo "=== Step 5: Reload proxy with SSL ==="
$COMPOSE stop proxy
$COMPOSE up -d proxy

echo "=== Step 6: Set up auto-renewal cron ==="
CRON_CMD="0 3 * * * cd /root/zane_salon && docker compose run --rm --profile certbot certbot renew --quiet && docker compose exec proxy nginx -s reload"
(crontab -l 2>/dev/null | grep -v certbot; echo "$CRON_CMD") | crontab -

echo ""
echo "=== SSL setup complete! ==="
echo "  https://main.zanesalon.com"
echo "  https://api.zanesalon.com"
echo "  https://pma.zanesalon.com"
echo ""
echo "Auto-renewal cron installed (daily at 3 AM)."
