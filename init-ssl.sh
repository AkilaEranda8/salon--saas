#!/bin/bash
# ── SSL initialization script for hexalyte.com (SaaS Multi-Tenant) ────────────
#
# This script obtains WILDCARD certificates for salon.hexalyte.com and
# hexalyte.com using the DNS-01 challenge via the Cloudflare plugin.
# The wildcard certs cover all tenant subdomains automatically.
#
# Prerequisites:
#   1. Cloudflare API token with Zone:DNS:Edit permission
#   2. Token saved in /root/cloudflare-credentials.ini:
#        dns_cloudflare_api_token = YOUR_TOKEN_HERE
#   3. docker-compose.yml certbot service uses certbot/dns-cloudflare image
#
# Run ONCE on the VPS:  bash init-ssl.sh
# After that, auto-renewal handles the rest.

set -e

EMAIL="akilaeranda8@gmail.com"
COMPOSE="docker compose"
CF_CREDS="/root/cloudflare-credentials.ini"

# ── Validate Cloudflare credentials file ─────────────────────────────────────
if [ ! -f "$CF_CREDS" ]; then
  echo "ERROR: Cloudflare credentials file not found at $CF_CREDS"
  echo ""
  echo "Create the file with:"
  echo "  dns_cloudflare_api_token = YOUR_CLOUDFLARE_API_TOKEN"
  echo ""
  echo "Get the token from: https://dash.cloudflare.com/profile/api-tokens"
  echo "Required permissions: Zone > DNS > Edit"
  exit 1
fi

chmod 600 "$CF_CREDS"

echo "=== Step 1: Start services (proxy needs to be up) ==="
$COMPOSE up -d proxy
sleep 3

echo "=== Step 2: Obtain wildcard SSL certificate via DNS-01 challenge ==="
$COMPOSE run --rm certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/cloudflare/credentials.ini \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --cert-name salon.hexalyte.com \
  -d salon.hexalyte.com \
  -d "*.salon.hexalyte.com"

echo "=== Step 2b: Obtain hexalyte.com wildcard certificate ==="
$COMPOSE run --rm certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/cloudflare/credentials.ini \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --cert-name hexalyte.com \
  -d hexalyte.com \
  -d "*.hexalyte.com"

echo "=== Step 3: Reload Nginx with the new wildcard certificate ==="
$COMPOSE exec proxy nginx -s reload || $COMPOSE restart proxy

echo "=== Step 4: Set up auto-renewal cron ==="
CRON_CMD="0 3 */14 * * cd /root/salon_v1 && docker compose run --rm certbot renew --quiet && docker compose exec proxy nginx -s reload"
(crontab -l 2>/dev/null | grep -v "certbot renew"; echo "$CRON_CMD") | crontab -

echo ""
echo "=== SSL setup complete! ==="
echo ""
echo "Wildcard certificates cover:"
echo "  https://salon.hexalyte.com"
echo "  https://api.salon.hexalyte.com"
echo "  https://pma.hexalyte.com"
echo "  https://admin.hexalyte.com"
echo "  https://*.salon.hexalyte.com  (all tenant subdomains)"
echo ""
echo "Auto-renewal cron installed (every 14 days at 3 AM)."
echo ""
echo "Next steps:"
echo "  1. Run the SaaS migration: docker compose exec backend node scripts/migrateToSaas.js"
echo "  2. Visit https://zane.salon.hexalyte.com to test your existing salon"
echo "  3. Visit https://salon.hexalyte.com/signup to test new tenant registration"
