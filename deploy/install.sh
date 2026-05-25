#!/usr/bin/env bash
# Optional VideoBot VPS setup helper. Run on the VPS as root or with sudo.
# Usage: sudo bash deploy/install.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/videobot}"
APP_USER="${APP_USER:-videobot}"
DOMAIN="${DOMAIN:-}"

echo "==> VideoBot install helper"
echo "    App directory: $APP_DIR"
echo "    App user:      $APP_USER"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root or with sudo."
  exit 1
fi

if [[ ! -f "$APP_DIR/video_automation_bot.py" ]]; then
  echo "Error: $APP_DIR/video_automation_bot.py not found."
  echo "Copy or clone the project to $APP_DIR first."
  exit 1
fi

echo "==> Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
  python3 python3-venv python3-pip ffmpeg nginx

if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

if ! id "$APP_USER" &>/dev/null; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Python virtualenv..."
sudo -u "$APP_USER" python3 -m venv "$APP_DIR/.venv"
sudo -u "$APP_USER" "$APP_DIR/.venv/bin/pip" install --upgrade pip
sudo -u "$APP_USER" "$APP_DIR/.venv/bin/pip" install -r "$APP_DIR/requirements-video-automation.txt"

if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/deploy/.env.production.example" "$APP_DIR/.env"
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "==> Created $APP_DIR/.env — edit it before starting the service."
fi

mkdir -p "$APP_DIR/tmp_video_jobs" "$APP_DIR/assets"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/tmp_video_jobs" "$APP_DIR/assets"

echo "==> Installing systemd unit..."
cp "$APP_DIR/deploy/videobot.service" /etc/systemd/system/videobot.service
systemctl daemon-reload
systemctl enable videobot

if [[ -f "$APP_DIR/admin-panel/dist/index.html" ]]; then
  echo "==> Admin panel dist/ present — skip server-side npm build."
elif [[ -f "$APP_DIR/admin-panel/package.json" ]] && command -v npm &>/dev/null; then
  echo "==> Building admin panel..."
  if [[ ! -f "$APP_DIR/admin-panel/.env" ]]; then
    cp "$APP_DIR/deploy/admin-panel.env.production.example" "$APP_DIR/admin-panel/.env"
    echo "    Edit $APP_DIR/admin-panel/.env then re-run npm run build if needed."
  fi
  cd "$APP_DIR/admin-panel"
  sudo -u "$APP_USER" npm ci
  sudo -u "$APP_USER" npm run build
else
  echo "==> Skip admin panel build (install Node/npm or build dist/ locally)."
fi

if [[ -n "$DOMAIN" ]]; then
  sed "s/YOUR_DOMAIN.com/$DOMAIN/g" "$APP_DIR/deploy/nginx/videobot.conf" \
    > /etc/nginx/sites-available/videobot
  ln -sf /etc/nginx/sites-available/videobot /etc/nginx/sites-enabled/videobot
  nginx -t
  systemctl reload nginx
  echo "==> nginx configured for $DOMAIN. Run: certbot --nginx -d $DOMAIN"
else
  cp "$APP_DIR/deploy/nginx/videobot.conf" /etc/nginx/sites-available/videobot
  echo "==> nginx config copied. Edit /etc/nginx/sites-available/videobot (set server_name)."
fi

echo ""
echo "Next steps:"
echo "  1. Copy token.json and client_secret.json to $APP_DIR"
echo "  2. Edit $APP_DIR/.env (paths, secrets, ADMIN_API_KEY)"
echo "  3. Edit admin-panel/.env and npm run build (if not done)"
echo "  4. systemctl start videobot"
echo "  5. certbot --nginx -d your-domain.com"
echo ""
echo "See deploy/README.md for full documentation."
