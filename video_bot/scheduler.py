"""Background loop: scheduled jobs + interval do-only triggers."""

import asyncio

from .config import (
    INTERVAL_TRIGGER_CHECK_SECONDS,
    SCHEDULE_CHECK_INTERVAL_SECONDS,
    logger,
)
from .google_services import build_google_services
from .interval_triggers import (
    load_interval_triggers,
    mark_triggers_fired,
    triggers_due_now,
)
from .sheets import get_sheet_rows, has_do_row, has_due_scheduled_row
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


async def interval_trigger_loop() -> None:
    """Poll interval triggers from Settings and render do rows only."""
    while True:
        await asyncio.sleep(INTERVAL_TRIGGER_CHECK_SECONDS)
        try:
            await try_fire_interval_triggers()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Interval trigger check failed")


async def try_trigger_scheduled_render() -> bool:
    """Queue a render if a due scheduled row exists and nothing is running."""
    if is_render_busy():
        return False

    sheets, _ = build_google_services()
    _, rows = get_sheet_rows(sheets)
    if not has_due_scheduled_row(rows):
        return False

    return await _queue_render(do_only=False, status_label="Queued (scheduled)")


async def try_trigger_do_render() -> bool:
    """Queue a render for do rows only (interval triggers)."""
    if is_render_busy():
        return False

    sheets, _ = build_google_services()
    _, rows = get_sheet_rows(sheets)
    if not has_do_row(rows):
        return False

    return await _queue_render(do_only=True, status_label="Queued (interval trigger)")


async def try_fire_interval_triggers() -> bool:
    triggers = load_interval_triggers()
    due = triggers_due_now(triggers)
    if not due:
        return False

    fired = await try_trigger_do_render()
    if fired:
        mark_triggers_fired([trigger.id for trigger in due])
        names = ", ".join(trigger.name or trigger.id for trigger in due)
        logger.info("Interval trigger fired (%s) — do render queued.", names)
    else:
        logger.info(
            "Interval trigger slot reached (%s) — no do rows or render busy.",
            ", ".join(trigger.name or trigger.id for trigger in due),
        )
    return fired


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
