import asyncio
import html
from collections.abc import Awaitable, Callable

from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes

from .config import (
    BACKGROUND_VIDEO_DRIVE_FOLDER,
    FFMPEG_BIN,
    MENU_RENDER_NEXT,
    MENU_SETTINGS,
    MENU_STOP,
    MENU_VIEW_STATS,
    SHEET_NAME,
    SPREADSHEET_ID,
    logger,
)
from .drive import google_drive_folder_id
from .jobs import run_render_job, run_retry_job
from .models import NoPendingRows
from .progress_display import admin_progress_callback
from .render_cleanup import cleanup_active_render
from .sheets import get_status_statistics
from .state import (
    current_render,
    is_render_busy,
    reset_current_render_idle,
    retry_jobs,
    task_lock,
)
from .telegram_notify import (
    notify_no_pending_rows,
    notify_render_failure,
    notify_render_success,
)
from .telegram_ui import (
    main_menu,
    send_unauthorized,
    is_authorized_chat,
)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id if update.effective_chat else None
    if not is_authorized_chat(chat_id):
        await send_unauthorized(update)
        return

    await update.effective_message.reply_text(
        "<b>Video automation</b>\nChoose an action below.",
        parse_mode=ParseMode.HTML,
        reply_markup=main_menu(),
    )


async def run_telegram_render(
    *,
    on_busy: Callable[[], Awaitable[None]] | None = None,
) -> None:
    """Run the next sheet render; notify admin chat on success or failure."""
    if is_render_busy():
        if on_busy is not None:
            await on_busy()
        return

    async with task_lock:
        try:
            result = await asyncio.to_thread(
                run_render_job,
                admin_progress_callback,
            )
        except NoPendingRows:
            reset_current_render_idle("No pending rows")
            await notify_no_pending_rows()
            return
        except Exception as exc:
            logger.exception("Render task failed")
            reset_current_render_idle(f"Failed: {exc}")
            await notify_render_failure(exc)
            return

    current_render.update({
        "running": False,
        "pct": 100,
        "status": "Done",
        "title": result.get("title", ""),
        "youtube_id": result.get("video_id", ""),
    })
    await notify_render_success(result)


async def render_next(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id if update.effective_chat else None
    if not is_authorized_chat(chat_id):
        await send_unauthorized(update)
        return

    await run_render_from_update(update, context)


async def run_render_from_update(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    async def on_busy() -> None:
        await update.effective_message.reply_text(
            "A render task is already running.",
            reply_markup=main_menu(),
        )

    await run_telegram_render(on_busy=on_busy)


async def handle_retry_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query is None:
        return

    chat_id = update.effective_chat.id if update.effective_chat else None
    if not is_authorized_chat(chat_id):
        await send_unauthorized(update)
        return

    await query.answer()

    if is_render_busy():
        await query.edit_message_text(
            "A render task is already running.",
            reply_markup=main_menu(),
        )
        return

    retry_id = (query.data or "").split(":", 1)[1]
    if retry_id not in retry_jobs:
        await query.edit_message_text(
            "This retry is no longer available. Start a new render.",
            reply_markup=main_menu(),
        )
        return

    async with task_lock:
        try:
            result = await asyncio.to_thread(
                run_retry_job,
                retry_id,
                admin_progress_callback,
            )
        except Exception as exc:
            logger.exception("Retry task failed")
            reset_current_render_idle(f"Failed: {exc}")
            await notify_render_failure(exc)
            return

    current_render.update({
        "running": False,
        "pct": 100,
        "status": "Done",
        "title": result.get("title", ""),
        "youtube_id": result.get("video_id", ""),
    })
    await notify_render_success(result)


async def handle_menu_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query is None:
        return

    chat_id = update.effective_chat.id if update.effective_chat else None
    if not is_authorized_chat(chat_id):
        await send_unauthorized(update)
        return

    await query.answer()

    if query.data == MENU_STOP:
        if is_render_busy():
            await asyncio.to_thread(
                cleanup_active_render,
                "Bot stopped — render interrupted",
            )

        await query.edit_message_text("Bot stopped. Run the Python script again to start it.")
        context.application.stop_running()
        return

    if query.data == MENU_RENDER_NEXT:
        async def on_busy() -> None:
            await query.edit_message_text(
                "A render task is already running.",
                reply_markup=main_menu(),
            )

        await run_telegram_render(on_busy=on_busy)
        return

    if query.data == MENU_VIEW_STATS:
        try:
            stats = await asyncio.to_thread(get_status_statistics)
        except Exception as exc:
            logger.exception("Could not load statistics")
            await query.edit_message_text(
                f"Could not load statistics:\n<code>{html.escape(str(exc))}</code>",
                parse_mode=ParseMode.HTML,
                reply_markup=main_menu(),
            )
            return

        status_lines = [
            f"{html.escape(status)}: <b>{count}</b>"
            for status, count in sorted(stats.items())
            if status != "total_rows"
        ]
        await query.edit_message_text(
            "<b>Sheet status</b>\n"
            f"Total rows: <b>{stats.get('total_rows', 0)}</b>\n"
            + "\n".join(status_lines),
            parse_mode=ParseMode.HTML,
            reply_markup=main_menu(),
        )
        return

    if query.data == MENU_SETTINGS:
        background_kind = (
            "Random Google Drive folder: "
            f"{google_drive_folder_id(BACKGROUND_VIDEO_DRIVE_FOLDER)}"
            if BACKGROUND_VIDEO_DRIVE_FOLDER
            else "Missing BACKGROUND_VIDEO_DRIVE_FOLDER"
        )
        settings = (
            "<b>Settings</b>\n"
            f"Sheet: <code>{html.escape(SHEET_NAME)}</code>\n"
            f"Spreadsheet ID: <code>{html.escape(SPREADSHEET_ID)}</code>\n"
            f"Background: <code>{html.escape(background_kind)}</code>\n"
            "Thumbnails: <code>Drive row rules only</code>\n"
            f"FFmpeg: <code>{html.escape(FFMPEG_BIN)}</code>"
        )
        await query.edit_message_text(
            settings,
            parse_mode=ParseMode.HTML,
            reply_markup=main_menu(),
        )
        return

    await query.edit_message_text("Unknown menu action.", reply_markup=main_menu())
