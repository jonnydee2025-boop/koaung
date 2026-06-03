"""Release in-flight renders and sync Google Sheet status when the bot stops."""

from .config import logger
from .sheets import mark_row_failed
from .state import (
    current_render,
    is_render_busy,
    reset_current_render_idle,
)
import video_bot.state as _state


def cleanup_active_render(reason: str = "Cancelled by user") -> bool:
    """
    Stop FFmpeg, mark the current sheet row as failed, and clear render state.
    Returns True if an in-flight render was cleaned up.
    """
    row_number = int(current_render.get("row_number") or 0)
    proc = _state.active_ffmpeg_process
    busy = is_render_busy()

    if not busy and proc is None:
        if row_number > 0:
            # Stale row_number after a completed render — do not touch the sheet.
            reset_current_render_idle()
        return False

    _state.render_cancel_requested = True

    if proc is not None:
        try:
            proc.terminate()
            logger.info("FFmpeg terminated during cleanup.")
        except Exception as exc:
            logger.warning("Could not terminate FFmpeg: %s", exc)

    if row_number > 0:
        try:
            mark_row_failed(row_number, reason)
            logger.info("Sheet row %s marked failed: %s", row_number, reason)
        except Exception as exc:
            logger.warning("Could not mark row %s failed: %s", row_number, exc)

    reset_current_render_idle(reason)
    return True
