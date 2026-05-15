#!/bin/bash
set -e

echo "════════════════════════════════════════════"
echo "  Hexa Salon - VPS Deployment Script"
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
APP_DIR="${APP_DIR:-/root/xanesalon}"

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

# Only write .env if it doesn't already exist (preserve production secrets)
if [ ! -f .env ]; then
cat > .env << 'EOF'
DB_PASS=rootpass
DB_NAME=zanesalon
JWT_SECRET=9f6b1a5d4e7c2b0a8d3f1e6c4b9a2d7f5c8e1a4b6d3f9c2e7a1b5d8f4c6e9a2
BACKEND_PORT=5001
SUPERADMIN_EMAIL=akilaeranda8@gmail.com
EOF
echo "✓ .env created"
else
  echo "✓ .env already exists (skipped)"
fi

echo "✓ Environment setup done"

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
echo "  Website:      https://salon.hexalyte.com"
echo "  Privacy:      https://salon.hexalyte.com/privacy-policy"
echo "  Management:   https://admin.hexalyte.com"
echo "  API:          https://api.salon.hexalyte.com"
echo "  phpMyAdmin:   https://pma.hexalyte.com"
echo ""
