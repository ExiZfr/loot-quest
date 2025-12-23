#!/bin/bash
#
# LootQuest VPS Deployment Script
# Ubuntu 22.04 LTS - 12 vCores, 24GB RAM
#
# Usage: sudo bash scripts/deploy.sh
#

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "   🎮 LootQuest High-Performance Deployment"
echo "═══════════════════════════════════════════════════════════════"

# ═══════════════════════════════════════════════════════════════════════════
# SYSTEM UPDATE
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# ═══════════════════════════════════════════════════════════════════════════
# NODE.JS 20 (LTS)
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "📗 Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo "   Node.js $(node -v) installed"
echo "   npm $(npm -v) installed"

# ═══════════════════════════════════════════════════════════════════════════
# REDIS SERVER
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "🔴 Installing Redis..."
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server

# Configure Redis for performance
cat > /etc/redis/redis.conf.d/lootquest.conf << 'EOF'
# LootQuest Redis Config
maxmemory 2gb
maxmemory-policy allkeys-lru
tcp-keepalive 300
EOF

systemctl restart redis-server
echo "   Redis $(redis-cli --version) installed"

# ═══════════════════════════════════════════════════════════════════════════
# PM2 PROCESS MANAGER
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "🔄 Installing PM2..."
npm install -g pm2
pm2 install pm2-logrotate

# Configure log rotation
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

echo "   PM2 $(pm2 -v) installed"

# ═══════════════════════════════════════════════════════════════════════════
# NGINX
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "🌐 Installing Nginx..."
apt install -y nginx

# Add rate limiting zone to nginx.conf
if ! grep -q "limit_req_zone" /etc/nginx/nginx.conf; then
    sed -i '/http {/a \    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;' /etc/nginx/nginx.conf
fi

systemctl enable nginx
echo "   Nginx installed"

# ═══════════════════════════════════════════════════════════════════════════
# CERTBOT (SSL)
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "🔒 Installing Certbot..."
apt install -y certbot python3-certbot-nginx
echo "   Certbot installed"

# ═══════════════════════════════════════════════════════════════════════════
# FIREWALL
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "🛡️  Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "   UFW configured"

# ═══════════════════════════════════════════════════════════════════════════
# APPLICATION DIRECTORY
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "📁 Setting up application directory..."
mkdir -p /var/www/lootquest
mkdir -p /var/www/lootquest/logs

# Copy files if running from git repo
if [ -f "package.json" ]; then
    echo "   Copying application files..."
    cp -r . /var/www/lootquest/
fi

cd /var/www/lootquest

# ═══════════════════════════════════════════════════════════════════════════
# INSTALL DEPENDENCIES
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "📦 Installing Node.js dependencies..."
npm install --production

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "⚙️  Configuring environment..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "   ⚠️  IMPORTANT: Edit /var/www/lootquest/.env with your secrets!"
fi

# ═══════════════════════════════════════════════════════════════════════════
# NGINX SITE
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "🌐 Configuring Nginx site..."
cp nginx/lootquest.conf /etc/nginx/sites-available/lootquest
ln -sf /etc/nginx/sites-available/lootquest /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
echo "   Nginx configured"

# ═══════════════════════════════════════════════════════════════════════════
# START APPLICATION
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "🚀 Starting LootQuest..."
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

# ═══════════════════════════════════════════════════════════════════════════
# COMPLETION
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "   ✅ LootQuest Deployment Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "   📍 Application: /var/www/lootquest"
echo "   🔧 Config: /var/www/lootquest/.env"
echo "   📝 Logs: pm2 logs lootquest"
echo ""
echo "   Next Steps:"
echo "   1. Edit .env with your secrets"
echo "   2. Setup SSL: sudo certbot --nginx -d yourdomain.com"
echo "   3. Reload: pm2 reload lootquest"
echo ""
echo "   Commands:"
echo "   - pm2 status        # Check status"
echo "   - pm2 logs          # View logs"
echo "   - pm2 reload all    # Zero-downtime restart"
echo "   - pm2 monit         # Real-time monitoring"
echo ""
