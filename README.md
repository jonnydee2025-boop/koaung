# VideoBot

Automates dhamma video production: reads jobs from a Google Sheet, renders video with FFmpeg, uploads privately to YouTube, and notifies you via Telegram. A React admin panel controls renders and shows live status.

## Requirements

- Python 3.11+
- Node.js 18+ (admin panel)
- FFmpeg / FFprobe on `PATH` or configured in `.env`
- Google Cloud OAuth client (`client_secret.json`) with Sheets, YouTube, and Drive scopes
- Telegram bot token

## Setup

1. Copy environment templates and fill in secrets:

   ```bash
   cp .env.example .env
   cp admin-panel/.env.example admin-panel/.env
   ```

   Set `ADMIN_API_KEY` in root `.env`. For local dev only, you may set `VITE_ADMIN_API_KEY` in `admin-panel/.env` to match (skips the login screen). **Production builds must leave `VITE_ADMIN_API_KEY` empty** — see `deploy/admin-panel.env.production.example`.

2. Install Python dependencies:

   ```bash
   pip install -r requirements-video-automation.txt
   ```

3. First Google OAuth (if `token.json` does not exist yet):

   ```bash
   python -m video_bot.app
   ```

   Complete the browser OAuth flow when prompted.

4. Install and run the admin panel (separate terminal):

   ```bash
   cd admin-panel
   npm install
   npm run dev
   ```

   Open http://localhost:5173 — API calls are proxied to http://localhost:8000.

## Running the bot

From the project root:

```bash
python -m video_bot.app
```

This starts:

- FastAPI admin API on `http://0.0.0.0:8000` (see `API_PORT`)
- Telegram polling for the configured admin chat

Swagger UI: http://localhost:8000/docs (protected routes require `X-Admin-Key`).

Health check (no auth): `GET /api/health`

## Environment variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_ADMIN_CHAT_ID` | Only this chat may use the bot |
| `GOOGLE_SHEET_ID` | Spreadsheet ID |
| `GOOGLE_SHEET_NAME` | Worksheet tab name |
| `BACKGROUND_VIDEO_DRIVE_FOLDER` | Google Drive folder URL or ID for backgrounds |
| `ADMIN_API_KEY` | Secret for admin panel / API (`X-Admin-Key` header) |
| `ADMIN_API_CORS_ORIGINS` | Comma-separated browser origins (default: Vite dev URLs) |
| `API_HOST` | Bind address (`0.0.0.0` dev, `127.0.0.1` behind nginx) |
| `API_PORT` | Admin API port (default `8000`) |
| `FFMPEG_BIN` / `FFPROBE_BIN` | Paths to binaries |
| `ENABLE_AUDIO_ENHANCE` | `true` / `false` |

See [.env.example](.env.example) for the full list.

## GitHub

- Use the root `.gitignore` before your first commit (excludes `node_modules`, `dist`, secrets, and temp files).
- See [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md) for `git init` and push steps.

## Security notes

- Do not commit `.env`, `token.json`, or `client_secret.json`.
- Run a single bot instance per sheet to avoid duplicate row processing.
- Change `ADMIN_API_KEY` from the example value before exposing the API beyond localhost.

## VPS deployment (24/7)

See **[deploy/README.md](deploy/README.md)** for full instructions: systemd service, nginx, HTTPS, and production `.env` templates.

Quick layout:

- `deploy/videobot.service` — systemd unit
- `deploy/nginx/videobot.conf` — static UI + `/api` reverse proxy
- `deploy/.env.production.example` — Linux VPS environment
- `deploy/install.sh` — optional setup script

On production, set `API_HOST=127.0.0.1` so only nginx reaches the API. Build the admin panel with `VITE_ADMIN_API_KEY` matching `ADMIN_API_KEY` (leave `VITE_API_BASE_URL` empty when UI and API share one domain).

## Project layout

- `video_bot/` — Telegram bot, render pipeline, FastAPI
- `admin-panel/` — React + Vite dashboard
