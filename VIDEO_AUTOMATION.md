# Telegram Video Automation

This bot listens for `/render_next`, reserves the first Google Sheet row with
`status=do`, or the first row with `status=pending` when no `do` row exists,
renders an MP4 from the row MP3 and a reusable background video, generates a
thumbnail, uploads the result to YouTube as private, and updates the sheet.

## Required Sheet Columns

- `status`
- `mp3_url`
- `dhamma_title`
- `description` is optional
- `logs` is created automatically if missing

## Setup

1. Install FFmpeg and confirm both `ffmpeg` and `ffprobe` are on PATH.
2. Create a Google OAuth desktop client JSON file and save it as
   `client_secret.json`.
3. Copy `.env.video-automation.example` to `.env` and fill in the values.
   Set `BACKGROUND_VIDEO_DRIVE_FOLDER` to a Google Drive folder link if you want
   the bot to pick one background video randomly for each upload. Supported
   files are `.mp4`, `.mov`, `.mkv`, and `.webm`.
   Adding Drive folder support requires the `drive.readonly` OAuth scope. If
   your old `token.json` does not refresh with that permission, the bot will
   ask you to sign in again and then retry the Drive folder download.
   Set `ENABLE_AUDIO_ENHANCE=false` if you want to render with the original
   audio instead of FFmpeg voice cleanup and loudness normalization.
4. Install dependencies:

```powershell
pip install -r requirements-video-automation.txt
```

5. Start the bot:

```powershell
python video_automation_bot.py
```

On first run, Google OAuth opens a browser. The resulting `token.json` is reused
for later runs.

## Code Layout

- `video_automation_bot.py` starts the bot.
- `video_bot/config.py` loads environment settings and validates startup files.
- `video_bot/google_services.py`, `sheets.py`, and `drive.py` handle Google APIs.
- `video_bot/media.py`, `thumbnails.py`, and `youtube.py` handle rendering assets and uploads.
- `video_bot/jobs.py` coordinates render/retry/thumbnail workflows.
- `video_bot/telegram_ui.py` and `handlers.py` handle Telegram messages and buttons.
