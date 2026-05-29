"""Background loop: due scheduled / repeat sheet rows."""

import asyncio

from .config import SCHEDULE_CHECK_INTERVAL_SECONDS, logger
from .google_services import build_google_services
from .sheets import get_sheet_rows, has_due_scheduled_row
from .state import current_render, is_render_busy, render_start_lock


async def scheduled_render_loop() -> None:
    """Poll for due scheduled sheet rows (not do rows)."""
    while True:
        await asyncio.sleep(SCHEDULE_CHECK_INTERVAL_SECONDS)
        try:
            await try_trigger_scheduled_render()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Scheduled render check failed")


async def try_trigger_scheduled_render() -> bool:
    """Queue a render if a due scheduled row exists and nothing is running."""
    if is_render_busy():
        return False

    sheets, _ = build_google_services()
    _, rows = get_sheet_rows(sheets)
    if not has_due_scheduled_row(rows):
        return False

    return await _queue_render(do_only=False, status_label="Queued (scheduled)")


async def _queue_render(*, do_only: bool, status_label: str) -> bool:
    async with render_start_lock:
        if is_render_busy():
            return False

        from .api.render_runner import run_admin_render
        from .config import validate_media_binaries

        try:
            validate_media_binaries()
        except FileNotFoundError as exc:
            logger.warning("Render skipped — media binaries: %s", exc)
            return False

        current_render.update({
            "running": True,
            "pct": 0,
            "status": status_label,
            "title": "",
            "youtube_id": "",
            "row_number": 0,
        })
        asyncio.create_task(run_admin_render(do_only=do_only))
        logger.info("%s — render queued.", status_label)
        return True
