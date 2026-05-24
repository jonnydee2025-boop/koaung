# Telegram Video Automation

This bot reads jobs from a Google Sheet, renders MP4s (MP3 + background video),
builds thumbnails, uploads to YouTube (public or private per rules below), and notifies you via Telegram.
A React **admin panel** and **FastAPI** API run in the same process for monitoring
and control.

## How jobs are picked

When a render starts (`/render_next`, admin **Render Next**, or a due
**Scheduled** row), the bot reserves **one** row and sets `status=processing`.
Batch member rows (non-anchor rows in a multi-row **Select Rows** rule) are never
picked directly — only the anchor row starts a batch job:

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

OAuth scopes required:

| Scope | Purpose |
|-------|---------|
| `spreadsheets` | Read/write job sheet |
| `drive.readonly` | Background videos and thumbnails |
| `youtube.upload` | Upload videos and custom thumbnails |
| `youtube.force-ssl` | **Set video public/private** after upload (`videos.update`) |

If an old `token.json` lacks a required scope (e.g. after adding `youtube.force-ssl` for public publish), delete it and sign in again when prompted. Refreshing an existing token **cannot** grant new scopes.

## Row-based rules (background + thumbnail + batch audio)

Configure in the admin panel **Settings → Row-Based Rules** (saved to
`row_range_rules.json` on the server, path via `ROW_RULES_PATH` in `.env`).

Each rule:

| Field | Description |
|-------|-------------|
| **Select Rows** | Comma-separated sheet row numbers (e.g. `70, 601, 805`). The **first** row is the anchor: only that row can start the job. Non-sequential rows are allowed. |
| **Background Video** | One `.mp4` from the Drive root |
| **Thumbnail Image** | One image from `Thumbnails/` |
| **Loops** | Repeat the same row's audio + background N times (single-row rules only; empty = auto background loop) |

### Single-row render (default)

When **Select Rows** contains one row (e.g. `100`), behavior is unchanged: download that row's `mp3_url`, optional audio enhance, render with the rule's background/thumbnail. **Loops** repeats that track N times when set.

### Batch multi-track render

When **Select Rows** lists **two or more** rows (e.g. `70, 601, 805`):

1. Only row **70** (the anchor) is picked from the queue; rows `601` and `805` are skipped automatically.
2. The bot downloads each row's `mp3_url` **in list order**.
3. FFmpeg resamples every track to 48 kHz stereo PCM, then **concatenates** them into one timeline (track 1 plays to the end, then track 2, and so on).
4. Background video uses **auto loop** over the **combined** audio duration (`Loops` is ignored for batch rules).
5. YouTube **title** and **description** are built by joining each row's values with ` | ` (empty parts skipped).
6. After a successful upload, **all** listed rows are marked `uploaded_to_yt` with the same log entry.

Retry from the admin panel on any batch row resolves to the anchor row and re-runs the full batch.

Legacy rules using **From Row / To Row** (sequential range) still work when loaded; saving from the admin panel converts them to **Select Rows**.

**On render**, for the current row number:

- If a rule matches and a background is set → download that video (not random).
- If a rule matches and a thumbnail is set → use that image (resized for YouTube).
- Otherwise → random background from root; no custom YouTube thumbnail unless a row rule provides one.

Later rules override earlier ones for the same field when rows overlap. Overlapping ranges cannot both set the same field type when saving rules.

## YouTube visibility (public / private)

Videos are **uploaded as private** first. After the full pipeline succeeds, visibility is updated:

| Situation | Final visibility | Sheet log |
|-----------|------------------|-----------|
| Row rule has a thumbnail **and** thumbnail upload succeeds | **Public** | `Uploaded publicly to YouTube. video_id=...` |
| No thumbnail in row rules | **Private** | `Uploaded privately (no thumbnail in row rules). video_id=...` |
| Thumbnail configured but YouTube rejects/fails | **Private** | `Uploaded privately (thumbnail failed: ...). video_id=...` |
| Thumbnail OK but OAuth lacks `youtube.force-ssl` | **Private** | `Uploaded privately (could not set public: OAuth scope — re-auth and retry). video_id=...` |
| Any error after the video is on YouTube | **Private** (unchanged) | Row `failed` — safe to retry |

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

## Troubleshooting

### Videos stay Private / `403 insufficient authentication scopes`

The bot uploads as **private**, then calls `videos.update` to set **public** when a row-rule thumbnail succeeds. That update requires the `youtube.force-ssl` OAuth scope.

1. Pull the latest code (includes `youtube.force-ssl` in `SCOPES`).
2. On your **local machine**: delete `token.json`, run the bot, complete Google OAuth (consent screen shows the new YouTube scope).
3. Copy the new token to the VPS and restart:
   ```bash
   scp token.json user@your-vps:/opt/videobot/
   sudo chown videobot:videobot /opt/videobot/token.json
   sudo systemctl restart videobot
   ```
4. **Already-uploaded private videos** are not auto-flipped. Set them to Public in YouTube Studio, or use admin **Retry** on the sheet row after re-auth (sheet-update retry will attempt public again).

If scope is still missing, the row is marked `uploaded_to_yt` (not `failed`) with a log explaining re-auth is needed.
