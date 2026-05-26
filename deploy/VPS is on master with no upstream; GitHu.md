VPS is on master with no upstream; GitHub uses main. Fixing by switching the VPS to main and syncing with origin/main.

Git pull is fixed on the VPS. Uploading the admin panel build from your PC because the VPS Node.js version is too old to build locally.

Your VPS could not pull for three reasons:

Wrong branch — VPS was on master, GitHub uses main
No upstream — master was not linked to origin/main
Local file conflict — deploy/test_gemini_live.py on the VPS blocked checkout
That is fixed now. VPS is on main at a7621dc, bot restarted, and the new admin UI was uploaded from your PC.

Why git pull failed
VPS:    master (no tracking)  →  commit 03a2a1e (old)
GitHub: main                  →  commit a7621dc (new)
git pull with no upstream branch gives:

There is no tracking information for the current branch.

Fix (already applied on your VPS)
cd /opt/videobot
git fetch origin main
rm -f deploy/test_gemini_live.py   # only if it blocks checkout
git checkout -B main origin/main
git branch --set-upstream-to=origin/main main
From now on — update VPS after you push to GitHub
1. Pull code on VPS:

cd /opt/videobot
git pull origin main
2. Restart Python bot (if backend changed):

.venv/bin/pip install -r requirements-video-automation.txt
systemctl restart videobot
3. Upload admin UI from your PC (VPS Node is too old to build):

cd j:\cuaor+\admin-panel
npm run build
$archive = "$env:TEMP\admin-dist.tar.gz"
tar -czf $archive -C "j:\cuaor+\admin-panel\dist" .
$env:DEPLOY_ENV_FILE = "j:\cuaor+\deploy\deploy.local.env"
python "j:\cuaor+\deploy\ssh_ops.py" scp $archive "/opt/videobot/admin-dist.tar.gz"
python "j:\cuaor+\deploy\ssh_ops.py" ssh "tar -xzf /opt/videobot/admin-dist.tar.gz -C /opt/videobot/admin-panel/dist && rm -f /opt/videobot/admin-dist.tar.gz"
4. Hard refresh browser: Ctrl + Shift + R on https://jexbot.site

If pull fails again
Error	Fix
Local changes block merge
git stash or git reset --hard origin/main
Untracked file would be overwritten
rm that file, then pull again
Authentication failed
Use HTTPS with token, or set up SSH key on VPS
Nuclear option (discards all VPS local changes):

cd /opt/videobot
git fetch origin main
git reset --hard origin/main
Do not use that if you edited .env or token.json only on the VPS — back those up first.

Your VPS is updated. Open https://jexbot.site/jobs — it should load the first 50 rows quickly with no cache ticker.