# VideoBot VPS deployment

Deploy the Python bot and admin panel on a Linux VPS (Ubuntu 22.04/24.04 recommended) so it runs 24/7 behind nginx with HTTPS.

## Architecture

```text
Internet
   │
   ▼
nginx :443 (TLS)
   ├─ /          → /opt/videobot/admin-panel/dist  (static React UI)
   └─ /api/*     → 127.0.0.1:8000                 (Python bot + FastAPI)

systemd: videobot.service → video_automation_bot.py
```

Only **one** bot instance per Google Sheet.

## Automated deploy from Windows

If you have SSH access from your PC:

1. Copy `deploy/deploy.local.env.example` → `deploy/deploy.local.env`
2. Fill in `VPS_HOST`, `VPS_USER`, `DOMAIN`, and `CERTBOT_EMAIL`
3. Copy `deploy/deploy.secrets.env.example` → `deploy/deploy.secrets.env` and add your tokens (same values as local `.env`, but **no Windows paths**)
4. Ensure `token.json` and `client_secret.json` exist in the project root (from local Google OAuth)
5. Point DNS **A record** for your domain to the VPS IP (at your domain registrar)
6. Run from project root:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/remote-deploy.ps1
```

The script uploads the project, merges secrets into the Linux `.env` template, runs `install.sh`, configures nginx, and attempts HTTPS via certbot.

Do **not** set `DEPLOY_USE_LOCAL_ENV=true` unless your local `.env` already uses Linux paths (`/opt/videobot/...`).

---

## Manual deploy

## 1. Server packages

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip ffmpeg nginx certbot python3-certbot-nginx git
```

Optional: Node.js 20+ only needed **on the server** if you build the admin panel there (otherwise build locally and upload `dist/`).

```bash
# Node 20 via NodeSource, or build admin panel on your PC and rsync dist/
```

## 2. Create app user and directory

```bash
sudo useradd --system --home /opt/videobot --shell /usr/sbin/nologin videobot || true
sudo mkdir -p /opt/videobot
sudo chown -R videobot:videobot /opt/videobot
```

Copy the project to `/opt/videobot` (git clone, rsync, or scp). Example:

```bash
sudo -u videobot git clone <your-repo-url> /opt/videobot
# or: rsync -av --exclude node_modules --exclude tmp_video_jobs ./ /opt/videobot/
```

## 3. Python virtualenv and dependencies

```bash
cd /opt/videobot
sudo -u videobot python3 -m venv .venv
sudo -u videobot .venv/bin/pip install --upgrade pip
sudo -u videobot .venv/bin/pip install -r requirements-video-automation.txt
```

## 4. Google OAuth (do this on your PC first)

The VPS cannot open a browser for first-time Google login.

1. On your **local machine**, run the bot once and complete OAuth.
2. Required scopes include `youtube.force-ssl` (needed to set videos **public** after upload). If you upgraded from an older version, **delete** the old `token.json` locally and re-authenticate before copying to the VPS.
3. Copy these files to the VPS:

```bash
scp token.json client_secret.json user@your-vps:/opt/videobot/
sudo chown videobot:videobot /opt/videobot/token.json /opt/videobot/client_secret.json
sudo chmod 600 /opt/videobot/token.json /opt/videobot/client_secret.json
sudo systemctl restart videobot
```

## 5. Environment file

```bash
sudo cp /opt/videobot/deploy/.env.production.example /opt/videobot/.env
sudo nano /opt/videobot/.env
sudo chown videobot:videobot /opt/videobot/.env
sudo chmod 600 /opt/videobot/.env
```

Required changes:

- All Telegram / Google IDs and tokens
- `ADMIN_API_KEY` — long random secret (`openssl rand -hex 32`)
- `ADMIN_API_CORS_ORIGINS=https://your-domain.com`
- `API_HOST=127.0.0.1` (only nginx should reach the API)
- Linux paths for `THUMBNAIL_TEMPLATE`, `FFMPEG_BIN`, `TMP_ROOT`, etc.

Also copy your thumbnail image and any assets to paths referenced in `.env`.

## 6. Build admin panel

On the VPS (or locally, then upload `dist/`):

```bash
cd /opt/videobot/admin-panel
cp ../deploy/admin-panel.env.production.example .env
# Set VITE_ADMIN_API_KEY to the SAME value as ADMIN_API_KEY in /opt/videobot/.env
# Leave VITE_API_BASE_URL empty when nginx serves UI and /api on the same domain
npm ci
npm run build
```

Result: `/opt/videobot/admin-panel/dist/`

## 7. systemd service

```bash
sudo cp /opt/videobot/deploy/videobot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable videobot
sudo systemctl start videobot
sudo systemctl status videobot
```

Logs:

```bash
journalctl -u videobot -f
```

## 8. nginx + HTTPS

```bash
sudo cp /opt/videobot/deploy/nginx/videobot.conf /etc/nginx/sites-available/videobot
sudo nano /etc/nginx/sites-available/videobot
# Replace YOUR_DOMAIN.com with your real domain

sudo ln -sf /etc/nginx/sites-available/videobot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d your-domain.com
```

## 9. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Do **not** expose port 8000 publicly when `API_HOST=127.0.0.1`.

## 10. Verify

| Check | Command / URL |
|-------|----------------|
| Bot running | `systemctl status videobot` |
| API health | `curl http://127.0.0.1:8000/api/health` |
| UI | `https://your-domain.com` |
| API auth | Dashboard loads stats (no 401) |

## Updating

```bash
cd /opt/videobot
sudo -u videobot git pull   # or rsync new files
sudo -u videobot .venv/bin/pip install -r requirements-video-automation.txt
cd admin-panel && npm ci && npm run build
sudo systemctl restart videobot
```

## Files in this folder

| File | Purpose |
|------|---------|
| `videobot.service` | systemd unit |
| `nginx/videobot.conf` | nginx site (UI + `/api` proxy) |
| `.env.production.example` | Root `.env` template for Linux VPS |
| `admin-panel.env.production.example` | Vite build env for admin panel |
| `install.sh` | Optional guided install helper |

## Troubleshooting

- **401 on admin panel** — `VITE_ADMIN_API_KEY` (build time) must match `ADMIN_API_KEY` (runtime). Rebuild after changing.
- **Google auth fails** — Ensure `token.json` exists and is readable by `videobot` user.
- **Videos stay Private / 403 insufficient authentication scopes** — Delete local `token.json`, re-run OAuth on your PC (must include `youtube.force-ssl`), copy new `token.json` to VPS, restart `videobot`. See `VIDEO_AUTOMATION.md` troubleshooting.
- **FFmpeg not found** — `which ffmpeg` and set `FFMPEG_BIN` / `FFPROBE_BIN` in `.env`.
- **Telegram conflict** — Only one `videobot` service; stop duplicate processes.
- **Sheet row stuck on processing** — Use Logs tab → Stop Rendering, or `systemctl restart videobot` (cleanup runs on exit).
