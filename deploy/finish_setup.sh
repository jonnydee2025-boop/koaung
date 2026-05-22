#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/videobot}"
APP_USER="${APP_USER:-videobot}"
DOMAIN="${DOMAIN:-194.182.87.248}"

id "$APP_USER" &>/dev/null || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if [[ ! -x "$APP_DIR/.venv/bin/python" ]]; then
  sudo -u "$APP_USER" python3 -m venv "$APP_DIR/.venv"
  sudo -u "$APP_USER" "$APP_DIR/.venv/bin/pip" install --upgrade pip -q
  sudo -u "$APP_USER" "$APP_DIR/.venv/bin/pip" install -r "$APP_DIR/requirements-video-automation.txt" -q
fi

mkdir -p "$APP_DIR/tmp_video_jobs" "$APP_DIR/assets"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/tmp_video_jobs" "$APP_DIR/assets"
chmod 600 "$APP_DIR/.env" 2>/dev/null || true
chown "$APP_USER:$APP_USER" "$APP_DIR/.env" 2>/dev/null || true
chown "$APP_USER:$APP_USER" "$APP_DIR/token.json" "$APP_DIR/client_secret.json" 2>/dev/null || true

sed -i "s|YOUR_DOMAIN.com|${DOMAIN}|g" "$APP_DIR/.env"
sed -i "s|^ADMIN_API_CORS_ORIGINS=.*|ADMIN_API_CORS_ORIGINS=http://${DOMAIN}|" "$APP_DIR/.env"

cp "$APP_DIR/deploy/videobot.service" /etc/systemd/system/videobot.service
systemctl daemon-reload
systemctl enable videobot

sed "s/YOUR_DOMAIN.com/${DOMAIN}/g" "$APP_DIR/deploy/nginx/videobot.conf" > /etc/nginx/sites-available/videobot
ln -sf /etc/nginx/sites-available/videobot /etc/nginx/sites-enabled/videobot
rm -f /etc/nginx/sites-enabled/default
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi
nginx -t
systemctl reload nginx
systemctl restart videobot

sleep 3
systemctl is-active videobot
curl -s "http://127.0.0.1/api/health" || true
echo ""
curl -s -o /dev/null -w "ui:%{http_code}" "http://127.0.0.1/"
