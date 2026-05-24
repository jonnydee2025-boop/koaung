"""Background render tasks started from the admin API."""

import asyncio

from fastapi import BackgroundTasks, HTTPException

from ..config import logger, validate_media_binaries
from ..jobs import run_render_job
from ..models import NoPendingRows
from ..progress_display import apply_progress_to_current_render
from ..render_cleanup import cleanup_active_render
from ..sheet_cache import invalidate_sheet_cache
from ..state import (
    current_render,
    is_render_busy,
    render_start_lock,
    reset_current_render_idle,
    task_lock,
)
import video_bot.state as state


async def run_admin_render(row_number: int | None = None) -> None:
    try:

        def progress_cb(status: str, pct: float | None = None) -> None:
            if state.render_cancel_requested:
                return
            apply_progress_to_current_render(status, pct)

        async with task_lock:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: run_render_job(progress_cb, row_number=row_number),
            )

        if state.render_cancel_requested:
            cleanup_active_render("Cancelled by user")
            return

        current_render.update({
            "running": False,
            "pct": 100,
            "status": "Done",
            "title": result.get("title", ""),
            "youtube_id": result.get("video_id", ""),
        })
        logger.info("Admin panel render complete: %s", result.get("title"))
    except NoPendingRows:
        reset_current_render_idle("No pending rows")
    except ValueError as exc:
        logger.error("Admin panel render rejected: %s", exc)
        reset_current_render_idle(str(exc))
    except Exception as exc:
        if state.render_cancel_requested:
            cleanup_active_render("Cancelled by user")
            logger.info("Admin panel render cancelled: %s", exc)
        else:
            logger.error("Admin panel render failed: %s", exc)
            reset_current_render_idle(f"Failed: {exc}")
    finally:
        state.render_cancel_requested = False
        invalidate_sheet_cache()


async def queue_admin_render(
    background_tasks: BackgroundTasks,
    *,
    row_number: int | None = None,
) -> dict:
    async with render_start_lock:
        if is_render_busy():
            raise HTTPException(
                status_code=409,
                detail="A render job is already running.",
            )
        try:
            validate_media_binaries()
        except FileNotFoundError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        current_render.update({
            "running": True,
            "pct": 0,
            "status": "Queued",
            "title": "",
            "youtube_id": "",
            "row_number": row_number or 0,
        })
        background_tasks.add_task(run_admin_render, row_number)

    return {"queued": True, "row": row_number} if row_number else {"queued": True}
