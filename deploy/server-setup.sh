#!/bin/bash
# server-setup.sh — run once on a fresh Ubuntu 24.04 server
# Usage: bash server-setup.sh <your-domain.io>

set -e
DOMAIN=${1:-"windrose-logs.io"}
APP_DIR="/opt/windrose-logs"

echo "=== [1/7] System update ==="
apt-get update && apt-get upgrade -y
apt-get install -y curl git ufw fail2ban

echo "=== [2/7] Install Docker ==="
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

echo "=== [3/7] Install Nginx & Certbot ==="
apt-get install -y nginx certbot python3-certbot-nginx

echo "=== [4/7] Firewall ==="
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=== [5/7] App directory ==="
mkdir -p $APP_DIR/storage/logs
cd $APP_DIR

echo "=== [6/7] Nginx config ==="
cat > /etc/nginx/sites-available/windrose-logs << EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 500m;
        proxy_read_timeout 300s;
    }

    # Hangfire dashboard (restrict to office IP if needed)
    location /hangfire {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
    }
}
EOF

ln -sf /etc/nginx/sites-available/windrose-logs /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== [7/7] SSL (Let's Encrypt) ==="
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@sundrift.tech

echo ""
echo "=== Done! Server is ready. ==="
echo "Now copy .env.production to $APP_DIR/.env and run:"
echo "  docker compose -f docker-compose.prod.yml up -d"
