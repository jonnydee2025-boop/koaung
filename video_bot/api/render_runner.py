"""Background render tasks started from the admin API."""

from fastapi import BackgroundTasks, HTTPException

from ..config import validate_media_binaries
from ..progress_display import admin_progress_callback
from ..render_chain import run_render_chain
from ..state import (
    current_render,
    is_render_busy,
    render_start_lock,
)
import video_bot.state as state


async def run_admin_render(
    row_number: int | None = None,
    *,
    do_only: bool = False,
) -> None:
    def progress_cb(status: str, pct: float | None = None) -> None:
        if state.render_cancel_requested:
            return
        admin_progress_callback(status, pct)

    await run_render_chain(
        progress_cb,
        row_number=row_number,
        do_only=do_only,
    )


async def queue_admin_render(
    background_tasks: BackgroundTasks,
    *,
    row_number: int | None = None,
    do_only: bool = False,
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
        background_tasks.add_task(run_admin_render, row_number, do_only=do_only)

    return {"queued": True, "row": row_number} if row_number else {"queued": True}
