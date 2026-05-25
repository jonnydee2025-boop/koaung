# VideoBot package layout

## Backend (`video_bot/`)

| Module | Role |
|--------|------|
| `app.py` | Entry: Telegram + FastAPI + scheduler loops |
| `config.py` | Environment and startup validation |
| `api/` | Admin REST API (FastAPI) |
| `api/routes/` | Route handlers by domain (`jobs`, `render`, `settings`, `system`) |
| `api/job_listing.py` | Sheet row → JSON for Jobs tab |
| `api/render_runner.py` | Background render tasks from admin UI |
| `api/schemas.py` | Pydantic models |
| `jobs/` | Render pipeline and retries |
| `jobs/pipeline.py` | Single-row render: download → encode → YouTube → sheet |
| `jobs/runner.py` | `run_render_job`, `run_retry_job` |
| `jobs/workdir.py` | Temp file cleanup on VPS |
| `handlers.py` | Telegram command/callback handlers |
| `sheets.py` | Google Sheet read/write, queue reserve, schedule, auto-do |
| `scheduler.py` | Due scheduled poll + interval trigger (do-only) loops |
| `interval_triggers.py` | Persisted Settings interval triggers |
| `schedule_time.py` | Parse/compare `Schedule_Time` |
| `sheet_cache.py` | In-memory cache for Jobs tab sheet reads |
| `drive.py` | Google Drive backgrounds & thumbnails |
| `media.py` | FFmpeg download/render |
| `youtube.py` | YouTube upload & thumbnail |
| `row_rules.py` | Row-range settings (JSON file) |
| `state.py` | In-process locks and render status |

## Admin panel (`admin-panel/src/data/`)

| File | Role |
|------|------|
| `httpClient.js` | Shared `fetch` + API key header |
| `api.js` | Re-exports all API functions |
| `jobsApi.js`, `settingsApi.js`, … | One file per backend domain |
| `queryCache.js` | In-memory stale-while-revalidate cache |
| `jobsSheet.js` | Client-side filter/pagination for Jobs tab |

## Run

```bash
python video_automation_bot.py
```

Imports stay stable: `from video_bot.api import app`, `from video_bot.jobs import run_render_job`.
