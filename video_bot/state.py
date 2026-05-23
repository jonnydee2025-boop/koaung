import asyncio
from collections.abc import Callable
import uuid
from typing import Any

from .models import RetryJob


task_lock = asyncio.Lock()
render_start_lock = asyncio.Lock()
ProgressCallback = Callable[[str, float | None], None]
PROGRESS_HTML_PREFIX = "__telegram_html_progress__:"

retry_jobs: dict[str, RetryJob] = {}

# Reference to the Telegram Application — set by app.py so the API can control polling
telegram_app: Any = None

# Reference to active FFmpeg process to allow cancellation
active_ffmpeg_process: Any = None
render_cancel_requested: bool = False

# Shared render progress — read by /api/render-status, written by render tasks
current_render: dict = {
    "running": False,
    "pct": 0,
    "status": "Idle",
    "title": "",
    "monk": "",
    "duration": "",
    "youtube_id": "",
    "row_number": 0,
}


def is_render_busy() -> bool:
    return task_lock.locked() or bool(current_render.get("running"))


def reset_current_render_idle(status: str = "Idle") -> None:
    current_render.update({
        "running": False,
        "pct": 0,
        "status": status,
        "title": "",
        "monk": "",
        "duration": "",
        "youtube_id": "",
        "row_number": 0,
    })


def register_retry_job(job: RetryJob) -> str:
    retry_id = uuid.uuid4().hex[:16]
    retry_jobs[retry_id] = job
    return retry_id
