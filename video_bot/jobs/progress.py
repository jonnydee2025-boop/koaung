"""Telegram / admin progress message formatting."""

import html

from ..models import SheetRow
from ..state import PROGRESS_HTML_PREFIX, ProgressCallback
from .row_helpers import get_duration_min


def progress_bar(percent: float) -> str:
    bounded = max(0.0, min(100.0, percent))
    filled = int(round(bounded / 10))
    return f"[{'#' * filled}{'.' * (10 - filled)}] {bounded:5.1f}%"


def format_job_progress_html(
    title: str,
    monk_name: str,
    duration_min: str,
    status: str,
    percent: float | None,
) -> str:
    progress = progress_bar(percent) if percent is not None else "loading..."
    return (
        f"{PROGRESS_HTML_PREFIX}"
        "<b>WORKING</b>\n"
        f"Title : <code>{html.escape(title or '-')}</code>\n"
        f"Monk : <code>{html.escape(monk_name or '-')}</code>\n"
        f"Duration : <code>{html.escape(duration_min or '-')}</code>\n"
        f"Status : <code>{html.escape(status)}</code>\n"
        f"Progress : <code>{html.escape(progress)}</code>"
    )


def row_progress_callback(
    row: SheetRow,
    title: str,
    monk_name: str,
    progress_callback: ProgressCallback | None,
) -> ProgressCallback | None:
    if progress_callback is None:
        return None

    duration_min = get_duration_min(row)

    def callback(status: str, percent: float | None = None) -> None:
        progress_callback(
            format_job_progress_html(title, monk_name, duration_min, status, percent),
            percent,
        )

    return callback
