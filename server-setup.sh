#!/bin/bash
set -e

echo "============================================"
echo "  GaurPay Server Setup - Ubuntu 24.04"
echo "============================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[✗]${NC} $1"; }

# ============================================
# Phase 1: System Update & Dependencies
# ============================================
echo ""
echo "======= Phase 1: System Setup ======="

log "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt update -y && apt upgrade -y

log "Installing essential tools..."
apt install -y curl wget git build-essential software-properties-common ufw

# Install Node.js 20 LTS
log "Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
node -v
npm -v

# Install PM2
log "Installing PM2 globally..."
npm install -g pm2

# Install Nginx
log "Installing Nginx..."
apt install -y nginx

# Install MySQL 8
log "Installing MySQL 8..."
apt install -y mysql-server
systemctl start mysql
systemctl enable mysql

# Install Certbot
log "Installing Certbot..."
apt install -y certbot python3-certbot-nginx

# Configure UFW Firewall
log "Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status

log "Phase 1 Complete!"

# ============================================
# Phase 2: MySQL Database Setup
# ============================================
echo ""
echo "======= Phase 2: MySQL Database ======="

DB_PASSWORD="Gp_Db_$(openssl rand -hex 8)"

log "Creating MySQL database and user..."
mysql -u root <<EOSQL
CREATE DATABASE IF NOT EXISTS gaurpay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'gaurpay'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON gaurpay.* TO 'gaurpay'@'localhost';
FLUSH PRIVILEGES;
EOSQL

log "Database 'gaurpay' created with user 'gaurpay'"
log "DB Password: ${DB_PASSWORD}"

# Save DB password to a temp file for reference
echo "${DB_PASSWORD}" > /root/.gaurpay_db_pass
chmod 600 /root/.gaurpay_db_pass

log "Phase 2 Complete!"

# ============================================
# Phase 3: Clone & Deploy Codebase
# ============================================
echo ""
echo "======= Phase 3: Codebase Deployment ======="

PROJECT_DIR="/www/wwwroot/gaurpay.site"

log "Creating project directory..."
mkdir -p ${PROJECT_DIR}

# Clone from GitHub
log "Cloning repository..."
if [ -d "${PROJECT_DIR}/.git" ]; then
    warn "Git repo already exists, pulling latest..."
    cd ${PROJECT_DIR}
    git pull origin main
else
    cd ${PROJECT_DIR}
    git clone https://github.com/Cad-0314/vspaypsp.git .
fi

# Create .env file for production
log "Creating production .env file..."
cat > ${PROJECT_DIR}/.env <<ENVEOF
APP_URL=https://gaurpay.site
NODE_ENV=production
SESSION_SECRET=gp_s3cr3t_k3y_v5p4y_2026_x7m9q
PORT=3000

# Database (MySQL - Production)
DB_DIALECT=mysql
DB_HOST=localhost
DB_USER=gaurpay
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=gaurpay

TELEGRAM_BOT_TOKEN=8596334035:AAHzGBMhCGv1VX5jvMAB-YgCo3nUqdXmv8M

# SILKPAY (Payable)
SILKPAY_BASE_URL=https://api.silkpay.ai
SILKPAY_MID=F7070
SILKPAY_SECRET=fE68nfNT14

# FENDPAY (UPI Super)
FENDPAY_BASE_URL=https://kspay.shop/pay
FENDPAY_MERCHANT_ID=2020234
FENDPAY_SECRET_KEY=2a0ca81e61ad4ddead6aba97160a7160

# CAIPAY (Yellow)
CAIPAY_BASE_URL=https://cai-pay.net/api/cai/out/v1
CAIPAY_MERCHANT_ID=1923067572689027074
CAIPAY_SECRET_KEY=placeholder_secret_key
CAIPAY_TOKEN=a41fd77e034d424b97e64ea42f17c544

# CKPAY
CKPAY_BASE_URL=https://www.ckckpay.com:5000
CKPAY_MERCHANT_ID=10034
CKPAY_APP_KEY=cBVW11lOhAFEqxN5

# BHARATPAY
BHARATPAY_BASE_URL=https://api-beta.bharatpay.cc
BHARATPAY_MERCHANT_ID=2961855541280768
BHARATPAY_API_KEY=436b03a0b8b043cfad02a764fc05cf94

# CXPAY
CXPAY_BASE_URL=https://apis.cxpay168.com/client
CXPAY_MERCHANT_ID=5a248625
CXPAY_SECRET_KEY=580d514a847f42ee8435460275e67ed3

# AAPAY
AAPAY_BASE_URL=https://test-api.daapay.xyz
AAPAY_MERCHANT_ID=20260119049641
AAPAY_SECRET_KEY=bhpqW8FxN5

# CALLBACK SKIPPING (Payin only)
CALLBACK_SKIP_ENABLED=true
CALLBACK_SKIP_PERCENT=3
CALLBACK_SKIP_WINDOW_MINS=10
CALLBACK_SKIP_ORDER_THRESHOLD=30
CALLBACK_SKIP_RATE_THRESHOLD=50

# IPAY
IPAY_BASE_URL=https://inipayapi.ipayin.net
IPAY_TOKEN=B41B4317C2EFFB5B12
IPAY_SECRET_KEY=2df1ae14e6d16101cd664a1b226a4bf9798a6269

# UNITEDPAY
UNITEDPAY_BASE_URL=https://phpay.ipayment.vip
UNITEDPAY_MCH_NO=M0560
UNITEDPAY_ENCRYPT_KEY=5AAC34325B1C4645
UNITEDPAY_SIGN_KEY=3AD2314E63FEE1E3

# FIRPAY
FIRPAY_BASE_URL=https://firepayment.org
FIRPAY_MERCHANT_ID=88856
FIRPAY_SECRET_KEY=2f812c79d51843729c4ff1e05c76c149

# AGPAY
AGPAY_BASE_URL=https://pay.perhap.in
AGPAY_MERCHANT_ID=M1771844038
AGPAY_SECRET_KEY=F960FDDB46F5470CA54147EB1656A35A
AGPAY_PAYIN_CHANNEL=8002
AGPAY_PAYOUT_CHANNEL=6002

# EASYPAY
EASYPAY_BASE_URL=https://mchapi.easypayy.xyz
EASYPAY_MERCHANT_ID=20260306087003
EASYPAY_SECRET_KEY=AQOIcAKdU1I7MK1J

# YNPAY
YNPAY_BASE_URL=https://www.ynuopay.com
YNPAY_APP_ID=10190
YNPAY_APP_SECRET=1dd5c7fa1bb3403c9a7dec88d0a9261e
YNPAY_IV=4744069535146147

# PASSPAY
PASSPAY_BASE_URL=https://api.merchant.passpay.cc
PASSPAY_MCH_ID=15761291
PASSPAY_SIGN_KEY=BHCm0loDFFVefS1PFDfKJuyNckY6XFn3
PASSPAY_PAY_ID=12

# TESTPAY (Simulated Test Channel - India INR)
TESTPAY_MERCHANT_ID=TEST_MERCHANT_001
TESTPAY_SECRET_KEY=test_secret_key_2026
TESTPAY_AUTO_SUCCESS_DELAY_MS=3000

# HDPAY
# (Add credentials when ready)

# DEPLOYMENT CONFIG
DEPLOY_HOST=139.180.135.210
DEPLOY_USER=root
DEPLOY_PATH=/www/wwwroot/gaurpay.site
ENVEOF

chmod 600 ${PROJECT_DIR}/.env

# Install dependencies
log "Installing Node.js dependencies..."
cd ${PROJECT_DIR}
npm install --production

# Create logs directory
mkdir -p ${PROJECT_DIR}/logs

# Start with PM2
log "Starting application with PM2..."
cd ${PROJECT_DIR}
pm2 delete gaurpay-api 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

log "Phase 3 Complete!"

# ============================================
# Phase 4: Nginx & Domain Setup
# ============================================
echo ""
echo "======= Phase 4: Nginx & Domain ======="

log "Creating Nginx server block..."
cat > /etc/nginx/sites-available/gaurpay.site <<'NGINXEOF'
# GaurPay - Nginx Reverse Proxy
upstream gaurpay_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name gaurpay.site www.gaurpay.site;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    # Max upload size
    client_max_body_size 10M;

    # Static files caching
    location /css/ {
        proxy_pass http://gaurpay_backend;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location /js/ {
        proxy_pass http://gaurpay_backend;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location /images/ {
        proxy_pass http://gaurpay_backend;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Main proxy
    location / {
        proxy_pass http://gaurpay_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
NGINXEOF

# Enable site
ln -sf /etc/nginx/sites-available/gaurpay.site /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t && systemctl reload nginx

log "Nginx configured!"

# Try SSL - will only work if DNS is pointing to this server
log "Attempting SSL setup (requires DNS to be pointing here)..."
certbot --nginx -d gaurpay.site -d www.gaurpay.site --non-interactive --agree-tos --email admin@gaurpay.site --redirect || {
    warn "SSL setup failed - DNS may not be pointing to this server yet."
    warn "Run manually later: certbot --nginx -d gaurpay.site -d www.gaurpay.site"
}

# Auto-renew SSL
systemctl enable certbot.timer

log "Phase 4 Complete!"

# ============================================
# Phase 5: Enhanced Deploy Script
# ============================================
echo ""
echo "======= Phase 5: Deploy Pipeline ======="

log "Creating enhanced deploy.sh on server..."
cat > ${PROJECT_DIR}/deploy.sh <<'DEPLOYEOF'
#!/bin/bash
set -e

echo "🚀 GaurPay Deployment Started..."
echo "   $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

cd /www/wwwroot/gaurpay.site

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Install dependencies (only if package.json changed)
if git diff HEAD@{1} --name-only 2>/dev/null | grep -q "package"; then
    echo "📦 Package changes detected, installing dependencies..."
    npm install --production
else
    echo "📦 No package changes, skipping npm install"
fi

# Reload PM2 with zero-downtime
echo "🔄 Reloading application (zero-downtime)..."
pm2 reload gaurpay-api --update-env

# Wait for ready
sleep 3

# Health check
echo "🏥 Running health check..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Health check passed! (HTTP $HTTP_CODE)"
else
    echo "⚠️  Health check returned HTTP $HTTP_CODE"
    echo "   Checking PM2 status..."
    pm2 status
fi

echo ""
echo "✅ Deployment Complete! $(date '+%Y-%m-%d %H:%M:%S')"
pm2 status
DEPLOYEOF

chmod +x ${PROJECT_DIR}/deploy.sh

log "Phase 5 Complete!"

# ============================================
# Summary
# ============================================
echo ""
echo "============================================"
echo "  🎉 GaurPay Server Setup Complete!"
echo "============================================"
echo ""
echo "  Domain:     gaurpay.site"
echo "  IP:         139.180.135.210"
echo "  App Dir:    /www/wwwroot/gaurpay.site"
echo "  Node:       $(node -v)"
echo "  PM2:        $(pm2 -v)"
echo "  MySQL User: gaurpay"
echo "  MySQL Pass: ${DB_PASSWORD}"
echo "  DB Name:    gaurpay"
echo ""
echo "  Useful Commands:"
echo "    pm2 status           - Check app status"
echo "    pm2 logs gaurpay-api - View logs"
echo "    ./deploy.sh          - Deploy updates"
echo ""
echo "  DB Password saved to: /root/.gaurpay_db_pass"
echo "============================================"
