#!/bin/bash
set -e

echo "════════════════════════════════════════════"
echo "  Xane Salon - VPS Deployment Script"
echo "════════════════════════════════════════════"

# ── 1. Install Docker ──────────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo ""
    echo "▸ Installing Docker..."
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    echo "✓ Docker installed"
else
    echo "✓ Docker already installed"
fi

# ── 2. Install Git ─────────────────────────────────────────────────────────────
if ! command -v git &> /dev/null; then
    echo ""
    echo "▸ Installing Git..."
    apt-get install -y git
    echo "✓ Git installed"
else
    echo "✓ Git already installed"
fi

# ── 3. Clone the repository ───────────────────────────────────────────────────
APP_DIR="/root/zanesalon"

if [ -d "$APP_DIR" ]; then
    echo ""
    echo "▸ Updating existing repo..."
    cd "$APP_DIR"
    git pull origin main
else
    echo ""
    echo "▸ Cloning repository..."
    git clone https://github.com/AkilaEranda8/salon--saas.git "$APP_DIR"
    cd "$APP_DIR"
fi

# ── 4. Create .env file ───────────────────────────────────────────────────────
echo ""
echo "▸ Setting up environment..."

cat > .env << 'EOF'
DB_PASS=kjsdksdjiereihshdks
DB_NAME=zanesalon
JWT_SECRET=zanesalon_jwt_secret_key_change_in_production
BACKEND_PORT=5001
DB_PORT=3307
EOF

cat > backend/.env << 'EOF'
DB_HOST=db
DB_USER=root
DB_PASS=kjsdksdjiereihshdks
DB_NAME=zanesalon
JWT_SECRET=zanesalon_jwt_secret_key_change_in_production
PORT=5000

# ── Email (Gmail SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM=Zane Salon <your_gmail@gmail.com>

# ── WhatsApp (Twilio)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
EOF

echo "✓ Environment files created"

# ── 5. Build and start containers ─────────────────────────────────────────────
echo ""
echo "▸ Building and starting Docker containers..."
docker compose down 2>/dev/null || true
docker compose up -d --build

echo ""
echo "▸ Waiting for services to start..."
sleep 10

# ── 6. Run database seed (first time only) ────────────────────────────────────
echo ""
echo "▸ Running database seed..."
docker compose run --rm seed 2>/dev/null || echo "  (seed may have already been applied)"

# ── 7. Show status ────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo "  Deployment Complete!"
echo "════════════════════════════════════════════"
echo ""
docker compose ps
echo ""
echo "    Website:     https://salon.hexalyte.com"
  echo "  Management:  https://admin.hexalyte.com"
  echo "  API:         https://api.salon.hexalyte.com"
  echo "  phpMyAdmin:  https://pma.hexalyte.com"
echo ""
