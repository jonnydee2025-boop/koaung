"""Run one or more render jobs in sequence until the queue is empty."""

from __future__ import annotations

import asyncio
from collections.abc import Callable

from .config import AUTO_QUEUE_NEXT_JOB, logger
from .jobs import run_render_job
from .models import NoPendingRows
from .render_cleanup import cleanup_active_render
from .sheets import has_next_render_row
from .state import current_render, reset_current_render_idle, task_lock
from .telegram_notify import (
    notify_no_pending_rows,
    notify_render_failure,
    notify_render_success,
)
import video_bot.state as state

ProgressCallback = Callable[[str, float | None], None]


async def run_render_chain(
    progress_callback: ProgressCallback,
    *,
    row_number: int | None = None,
    do_only: bool = False,
    auto_chain: bool | None = None,
) -> None:
    """
    Run render job(s). When auto_chain is enabled and row_number is None,
    reserve and process the next eligible row after each success until none remain.
    """
    chain_enabled = AUTO_QUEUE_NEXT_JOB if auto_chain is None else auto_chain
    should_chain = chain_enabled and row_number is None
    next_row = row_number

    while True:
        try:
            async with task_lock:
                result = await asyncio.to_thread(
                    run_render_job,
                    progress_callback,
                    row_number=next_row,
                    do_only=do_only,
                )

            if state.render_cancel_requested:
                cleanup_active_render("Cancelled by user")
                return

            logger.info("Render complete: %s", result.get("title"))
            await notify_render_success(result)

            if not should_chain:
                current_render.update({
                    "running": False,
                    "pct": 100,
                    "status": "Done",
                    "title": result.get("title", ""),
                    "youtube_id": result.get("video_id", ""),
                    "row_number": 0,
                })
                return

            if not await asyncio.to_thread(has_next_render_row, do_only=do_only):
                current_render.update({
                    "running": False,
                    "pct": 100,
                    "status": "Done",
                    "title": result.get("title", ""),
                    "youtube_id": result.get("video_id", ""),
                    "row_number": 0,
                })
                logger.info("Auto-queue finished — no more eligible rows.")
                return

            next_row = None
            current_render.update({
                "running": True,
                "pct": 0,
                "status": "Queued (auto)",
                "title": "",
                "youtube_id": "",
                "row_number": 0,
            })
            logger.info("Auto-queue: starting next job.")
        except NoPendingRows:
            idle_msg = "No do rows" if do_only else "No do or scheduled rows"
            reset_current_render_idle(idle_msg)
            await notify_no_pending_rows()
            return
        except ValueError as exc:
            logger.error("Render rejected: %s", exc)
            reset_current_render_idle(str(exc))
            await notify_render_failure(exc)
            return
        except Exception as exc:
            if state.render_cancel_requested:
                cleanup_active_render("Cancelled by user")
                logger.info("Render cancelled: %s", exc)
            else:
                logger.error("Render failed: %s", exc)
                reset_current_render_idle(f"Failed: {exc}")
                await notify_render_failure(exc)
            return
        finally:
            state.render_cancel_requested = False
