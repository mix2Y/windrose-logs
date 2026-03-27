#!/bin/bash
# network-setup.sh — restrict access to internal network only
# Run: bash /tmp/network-setup.sh

set -e
INTERNAL_IP="10.0.0.38"

echo "=== Configuring nginx to listen on internal IP only ==="
cat > /etc/nginx/sites-available/windrose-logs << 'EOF'
server {
    listen 10.0.0.38:80;
    server_name windroselogs;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:8080;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        client_max_body_size 500m;
        proxy_read_timeout   300s;
    }

    location /hangfire {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
    }
}
EOF

echo "=== Updating UFW — block public, allow internal ==="
# Сброс правил HTTP/HTTPS
ufw delete allow 80/tcp  2>/dev/null || true
ufw delete allow 443/tcp 2>/dev/null || true

# Разрешаем только с 10.0.0.0/8 (VPN + LAN)
ufw allow from 10.0.0.0/8 to any port 80  proto tcp
ufw allow from 10.0.0.0/8 to any port 443 proto tcp

# SSH оставляем (уже есть)
ufw reload

echo "=== Testing nginx config ==="
nginx -t && systemctl reload nginx

echo "=== Done! Service now accessible only from internal network ==="
echo "    URL: http://windroselogs (or http://10.0.0.38)"
ufw status
