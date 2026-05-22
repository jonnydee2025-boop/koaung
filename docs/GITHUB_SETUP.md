# GitHub setup

See the project root `.gitignore` and `.env.example` files. Never commit secrets, `node_modules`, `dist`, or `tmp_video_jobs`.

## First-time Git on your PC

```powershell
cd J:\cuaor+
git init
git add .
git status
```

Confirm that **ignored** paths do not appear as staged (no `node_modules`, no `.env`, no `dist`).

```powershell
git commit -m "Initial commit: VideoBot app and admin panel"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

## If something sensitive was already tracked

```powershell
git rm -r --cached admin-panel/node_modules admin-panel/dist .env deploy/deploy.local.env deploy/deploy.secrets.env token.json client_secret.json 2>$null
git add .gitignore
git commit -m "Stop tracking generated and secret files"
```
