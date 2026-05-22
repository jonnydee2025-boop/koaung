# Telegram Video Automation

This bot reads jobs from a Google Sheet, renders MP4s (MP3 + background video),
builds thumbnails, uploads to YouTube as private, and notifies you via Telegram.
A React **admin panel** and **FastAPI** API run in the same process for monitoring
and control.

## How jobs are picked

When a render starts (`/render_next`, admin **Render Next**, or a due
**Scheduled** row), the bot reserves **one** row and sets `status=processing`:

1. **Scheduled** rows whose `Schedule_Time` is due (earliest first)
2. **`do`** rows (manual priority from admin **Prioritize**)
3. **`pending`** rows

Only one bot instance should run per sheet.

## Required sheet columns

| Column | Required | Notes |
|--------|----------|--------|
| `status` | Yes | e.g. `pending`, `do`, `Scheduled`, `processing`, `failed`, `uploaded_to_yt` |
| `mp3_url` | Yes | Source audio URL |
| `dhamma_title` | Yes | Used for video title and template thumbnails |
| `description` | No | YouTube description |
| `Schedule_Time` | No | ISO date/time for scheduled jobs (set via admin **Schedule**) |
| `logs` | Auto | Created/updated by the bot |

Monk/speaker name can live in any of: `moke_name`, `monk_name`, `monk`, `speaker`, `teacher`, `sayadaw`.

## Google Drive layout

Set `BACKGROUND_VIDEO_DRIVE_FOLDER` in `.env` to your shared folder URL or ID.

| Location | Contents |
|----------|----------|
| **Drive folder root** | Background videos (`.mp4` for row rules; random pick also allows `.mov`, `.mkv`, `.webm`) |
| **`Thumbnails/` subfolder** | Thumbnail images (`.jpg`, `.png`) for row-based rules |

OAuth needs `drive.readonly`. If an old `token.json` lacks Drive scope, delete it
and sign in again when prompted.

## Row-based rules (background + thumbnail)

Configure in the admin panel **Settings → Row-Based Rules** (saved to
`row_range_rules.json` on the server, path via `ROW_RULES_PATH` in `.env`).

Each rule:

| Field | Description |
|-------|-------------|
| **From Row** | First sheet row number (1-based data rows) |
| **To Row** | Last row (optional; empty = single row) |
| **Background Video** | One `.mp4` from the Drive root |
| **Thumbnail Image** | One image from `Thumbnails/` |

**On render**, for the current row number:

- If a rule matches and a background is set → download that video (not random).
- If a rule matches and a thumbnail is set → use that image (resized for YouTube).
- Otherwise → random background from root + thumbnail from `THUMBNAIL_TEMPLATE` + title text.

First matching rule wins. Overlapping ranges are rejected when saving rules.

## Admin panel features

| Feature | Description |
|---------|-------------|
| **Login** | `ADMIN_API_KEY` entered once per browser session (not baked into production builds) |
| **Dashboard / Jobs** | Live sheet data with pagination and filters |
| **Prioritize** | Sets row `status=do` (picked before `pending`) |
| **Schedule** | Sets `status=Scheduled` + `Schedule_Time`; duplicate times are rejected |
| **Row rules** | Settings table above |
| **Render Next / Stop** | Queue or cancel renders from the Logs header |

Build the UI locally (`admin-panel/npm run build`), upload `dist/` to the server.
See `deploy/README.md` for VPS/nginx/systemd.

## Setup (local)

1. Install **FFmpeg** / **ffprobe** on PATH (or set `FFMPEG_BIN` / `FFPROBE_BIN`).
2. Add `client_secret.json` (Google OAuth desktop client).
3. Copy env templates and fill secrets:

   ```powershell
   copy .env.example .env
   copy admin-panel\.env.example admin-panel\.env
   ```

   Set the same secret in `ADMIN_API_KEY` and (local dev only) `VITE_ADMIN_API_KEY`.

4. Install Python deps:

   ```powershell
   pip install -r requirements-video-automation.txt
   ```

5. Install and run the admin panel (second terminal):

   ```powershell
   cd admin-panel
   npm install
   npm run dev
   ```

   Open http://localhost:5173 (API proxied to port 8000).

6. Start the bot:

   ```powershell
   python video_automation_bot.py
   ```

   On first run, complete Google OAuth in the browser; `token.json` is reused later.

### Useful `.env` variables

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token |
| `TELEGRAM_ADMIN_CHAT_ID` | Admin chat for menus and progress |
| `GOOGLE_SHEET_ID` / `GOOGLE_SHEET_NAME` | Job sheet |
| `BACKGROUND_VIDEO_DRIVE_FOLDER` | Drive folder for backgrounds + `Thumbnails/` |
| `THUMBNAIL_TEMPLATE` | Local JPG/PNG template when no row thumbnail rule |
| `ADMIN_API_KEY` | Protects `/api/*`; admin panel login |
| `ADMIN_API_CORS_ORIGINS` | Allowed browser origins for the API |
| `API_HOST` / `API_PORT` | API bind address (use `127.0.0.1` behind nginx on VPS) |
| `ROW_RULES_PATH` | JSON file for row-based rules (default: `row_range_rules.json`) |
| `SCHEDULE_CHECK_INTERVAL_SECONDS` | How often to check for due scheduled rows (default: 30) |
| `ENABLE_AUDIO_ENHANCE` | FFmpeg voice EQ + loudness (default: true) |

Example row-rules file: `row_range_rules.example.json`.

## Code layout

| Path | Role |
|------|------|
| `video_automation_bot.py` | Entry point |
| `video_bot/app.py` | Telegram + FastAPI + scheduled-render loop |
| `video_bot/config.py` | Environment and startup validation |
| `video_bot/api.py` | Admin REST API |
| `video_bot/sheets.py` | Sheet read/write, reserve next row, schedule, prioritize |
| `video_bot/drive.py` | Drive listing, downloads, row-rule media |
| `video_bot/row_rules.py` | Load/save/validate row-range rules |
| `video_bot/schedule_time.py` | Parse/compare `Schedule_Time` |
| `video_bot/scheduler.py` | Background task for due scheduled renders |
| `video_bot/jobs.py` | Render, retry, thumbnail workflows |
| `video_bot/media.py` | FFmpeg render and audio enhance |
| `video_bot/thumbnails.py` | Template or Drive thumbnail for a row |
| `video_bot/youtube.py` | Upload and thumbnail update |
| `video_bot/handlers.py` | Telegram commands and callbacks |
| `admin-panel/` | React admin UI (Vite) |
| `deploy/` | VPS install scripts, nginx, systemd unit |

## Security notes

- Do not commit `.env`, `token.json`, `client_secret.json`, or `row_range_rules.json`.
- Do not set `VITE_ADMIN_API_KEY` in production builds (users sign in with the API key).
- Run a single bot instance per sheet to avoid Telegram `getUpdates` conflicts.
