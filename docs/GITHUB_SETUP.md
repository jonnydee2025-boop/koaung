# GitHub setup and updates

Use GitHub as the source of truth for **code**. Secrets, builds, and runtime files stay on each machine (see root `.gitignore`).

**Never commit:** `.env`, `token.json`, `client_secret.json`, `node_modules/`, `admin-panel/dist/`, `row_range_rules.json`, `deploy/deploy.local.env`, `deploy/deploy.secrets.env`.

---

## 1. One-time: create the repo and push from your PC

### On GitHub (browser)

1. Create a new repository (e.g. `videobot`) — **Private** recommended.
2. Do **not** add a README/license if you already have code locally (avoids merge conflicts).

### On your PC

```powershell
cd J:\cuaor+

# First time only
git init
git add .
git status
```

Check that `git status` does **not** list `node_modules`, `.env`, `dist`, or `token.json`.

```powershell
git commit -m "Initial commit: VideoBot"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Use GitHub CLI if you prefer:

```powershell
gh auth login
gh repo create YOUR_USER/videobot --private --source=. --remote=origin --push
```

---

## 2. Day-to-day: push changes from your PC

After you edit code locally:

```powershell
cd J:\cuaor+
git status
git add .
git commit -m "Describe what you changed"
git push
```

Only commit real source changes. Rebuild the admin panel **after** pulling on the server (or build locally and upload `dist/` — see below).

---

## 3. Update the VPS from GitHub

SSH into the server. The app should live in something like `/opt/videobot`.

### First time on VPS (clone)

```bash
cd /opt
sudo git clone https://github.com/YOUR_USER/YOUR_REPO.git videobot
sudo chown -R videobot:videobot /opt/videobot
```

Copy secrets **on the server** (not from GitHub):

```bash
sudo -u videobot cp /path/to/your/.env /opt/videobot/.env
sudo -u videobot cp /path/to/token.json /opt/videobot/
sudo -u videobot cp /path/to/client_secret.json /opt/videobot/
```

Install Python deps and set up systemd/nginx once — see [deploy/README.md](../deploy/README.md).

### Every update (pull)

```bash
cd /opt/videobot
sudo -u videobot git pull origin main
```

Then apply what changed:

| What changed | What to run on VPS |
|--------------|-------------------|
| Python (`video_bot/`, etc.) | `sudo systemctl restart videobot` |
| Admin UI (`admin-panel/src/`) | Build on PC or on VPS, then serve new `dist/` |

**Option A — build admin panel on your PC, upload `dist/` (SFTP)**

```powershell
cd J:\cuaor+\admin-panel
npm install
npm run build
```

Upload `admin-panel/dist/` → `/opt/videobot/admin-panel/dist/` (no restart needed for static files).

**Option B — build on VPS** (needs Node 20+)

```bash
cd /opt/videobot/admin-panel
sudo -u videobot npm ci
sudo -u videobot npm run build
```

**Python dependencies** (only if `requirements-video-automation.txt` changed):

```bash
cd /opt/videobot
sudo -u videobot .venv/bin/pip install -r requirements-video-automation.txt
sudo systemctl restart videobot
```

**Row rules** (`row_range_rules.json`) and **`.env`** are **not** in git — keep them only on the server.

---

## 4. Authentication tips

| Method | Notes |
|--------|--------|
| **HTTPS + PAT** | GitHub → Settings → Developer settings → Personal access tokens. Use as password when `git push` asks. |
| **SSH** | Add SSH key to GitHub; remote: `git@github.com:YOUR_USER/YOUR_REPO.git` |
| **Private repo on VPS** | Use a deploy key (read-only) or PAT on the server for `git pull` |

---

## 5. If you committed secrets by mistake

```powershell
cd J:\cuaor+
git rm --cached .env token.json client_secret.json deploy/deploy.local.env
git commit -m "Remove secrets from tracking"
git push
```

Rotate any exposed tokens/passwords. If the repo was public, treat keys as compromised.

---

## Quick reference

```text
PC:  edit code → git add → git commit → git push
VPS: git pull → (rebuild dist if UI changed) → restart videobot if Python changed
```
