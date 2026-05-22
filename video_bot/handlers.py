import asyncio
import html
import shutil
from collections.abc import Awaitable, Callable

from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes

from .config import (
    ADMIN_CHAT_ID,
    BACKGROUND_VIDEO_DRIVE_FOLDER,
    FFMPEG_BIN,
    MENU_RENDER_NEXT,
    MENU_SETTINGS,
    MENU_STOP,
    MENU_VIEW_STATS,
    SHEET_NAME,
    SPREADSHEET_ID,
    THUMBNAIL_TEMPLATE,
    logger,
)
from .drive import google_drive_folder_id
from .jobs import (
    apply_pending_thumbnail,
    cleanup_success_artifacts,
    register_pending_thumbnail,
    remove_pending_thumbnail,
    run_render_job,
    run_retry_job,
    skip_pending_thumbnail,
)
from .models import NoPendingRows
from .sheets import get_status_statistics
from .state import (
    current_render,
    is_render_busy,
    pending_thumbnail_by_chat,
    pending_thumbnail_jobs,
    reset_current_render_idle,
    retry_jobs,
    task_lock,
)
from .telegram_ui import (
    delete_chat_message,
    edit_progress_message,
    failure_reply_markup,
    format_failure_message,
    format_progress_message,
    main_menu,
    make_telegram_progress_callback,
    replace_with_success_message,
    send_unauthorized,
    thumbnail_menu,
    is_authorized_chat,
)
from .progress_display import apply_progress_to_current_render
from .render_cleanup import cleanup_active_render
from .thumbnails import prepare_thumbnail_image


def make_shared_progress_callback(bot, chat_id, message_id, loop, title: str = ""):
    """Wraps make_telegram_progress_callback so progress also updates current_render."""
    telegram_cb = make_telegram_progress_callback(bot, chat_id, message_id, loop)
    current_render.update({
        "running": True,
        "pct": 0,
        "status": "Starting",
        "title": title,
        "youtube_id": "",
        "row_number": 0,
    })

    def combined(status: str, pct: float | None = None) -> None:
        apply_progress_to_current_render(status, pct)
        telegram_cb(status, pct)

    return combined


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


async def send_render_success(
    bot,
    chat_id: int,
    message_id: int,
    result: dict[str, str],
) -> None:
    result = register_pending_thumbnail(chat_id, result)
    if not result.get("thumbnail_id"):
        cleanup_success_artifacts(result)

    await replace_with_success_message(bot, chat_id, message_id, result)


async def run_telegram_render(
    bot,
    chat_id: int,
    message_id: int,
    *,
    delete_trigger_message_id: int | None = None,
    on_busy: Callable[[], Awaitable[None]] | None = None,
) -> None:
    """Run the next sheet render with Telegram progress UI."""
    if is_render_busy():
        if on_busy is not None:
            await on_busy()
        return

    progress_callback = make_shared_progress_callback(
        bot,
        chat_id,
        message_id,
        asyncio.get_running_loop(),
    )

    async with task_lock:
        try:
            result = await asyncio.to_thread(run_render_job, progress_callback)
        except NoPendingRows:
            reset_current_render_idle("No pending rows")
            await edit_progress_message(
                bot,
                chat_id,
                message_id,
                "No do or pending rows found.",
                reply_markup=main_menu(),
            )
            return
        except Exception as exc:
            logger.exception("Render task failed")
            reset_current_render_idle(f"Failed: {exc}")
            await edit_progress_message(
                bot,
                chat_id,
                message_id,
                text=format_failure_message(exc),
                parse_mode=ParseMode.HTML,
                reply_markup=failure_reply_markup(exc),
            )
            return

    current_render.update({
        "running": False,
        "pct": 100,
        "status": "Done",
        "title": result.get("title", ""),
        "youtube_id": result.get("video_id", ""),
    })
    if delete_trigger_message_id is not None:
        await delete_chat_message(bot, chat_id, delete_trigger_message_id)
    await send_render_success(bot, chat_id, message_id, result)


async def render_next(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id if update.effective_chat else None
    if not is_authorized_chat(chat_id):
        await send_unauthorized(update)
        return

    await run_render_from_update(update, context)


async def run_render_from_update(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id if update.effective_chat else ADMIN_CHAT_ID

    async def on_busy() -> None:
        await update.effective_message.reply_text(
            "A render task is already running.",
            reply_markup=main_menu(),
        )

    progress_message = await update.effective_message.reply_text(
        format_progress_message("Starting"),
        parse_mode=ParseMode.HTML,
    )
    await run_telegram_render(
        context.bot,
        chat_id,
        progress_message.message_id,
        delete_trigger_message_id=update.effective_message.message_id,
        on_busy=on_busy,
    )


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

    await query.edit_message_text(
        format_progress_message("Retrying"),
        parse_mode=ParseMode.HTML,
    )
    progress_callback = make_shared_progress_callback(
        context.bot,
        chat_id or ADMIN_CHAT_ID,
        query.message.message_id,
        asyncio.get_running_loop(),
    )

    async with task_lock:
        try:
            result = await asyncio.to_thread(run_retry_job, retry_id, progress_callback)
        except Exception as exc:
            logger.exception("Retry task failed")
            reset_current_render_idle(f"Failed: {exc}")
            await query.edit_message_text(
                format_failure_message(exc),
                parse_mode=ParseMode.HTML,
                reply_markup=failure_reply_markup(exc),
            )
            return

    current_render.update({
        "running": False,
        "pct": 100,
        "status": "Done",
        "title": result.get("title", ""),
        "youtube_id": result.get("video_id", ""),
    })
    await send_render_success(
        context.bot,
        chat_id or ADMIN_CHAT_ID,
        query.message.message_id,
        result,
    )


async def handle_thumbnail_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query is None:
        return

    chat_id = update.effective_chat.id if update.effective_chat else None
    if not is_authorized_chat(chat_id):
        await send_unauthorized(update)
        return

    await query.answer()

    parts = (query.data or "").split(":")
    if len(parts) != 3:
        await query.edit_message_text("Unknown thumbnail action.", reply_markup=main_menu())
        return

    action, thumbnail_id = parts[1], parts[2]
    job = pending_thumbnail_jobs.get(thumbnail_id)
    if job is None:
        await query.edit_message_text(
            "This thumbnail request is no longer available.",
            reply_markup=main_menu(),
        )
        return

    if action == "skip":
        try:
            await asyncio.to_thread(skip_pending_thumbnail, thumbnail_id)
        except Exception as exc:
            logger.warning("Could not update skipped thumbnail status: %s", exc)
            remove_pending_thumbnail(thumbnail_id)
            shutil.rmtree(job.workdir, ignore_errors=True)
        await replace_with_success_message(
            context.bot,
            chat_id or ADMIN_CHAT_ID,
            query.message.message_id,
            {
                "title": job.title,
                "monk_name": job.monk_name,
                "video_id": job.video_id,
                "url": f"https://studio.youtube.com/video/{job.video_id}/edit",
                "youtube_url": f"https://youtu.be/{job.video_id}",
            },
        )
        return

    if action != "auto":
        await query.edit_message_text("Unknown thumbnail action.", reply_markup=main_menu())
        return

    await query.edit_message_text(
        "<b>Uploading thumbnail</b>\nUsing the generated image.",
        parse_mode=ParseMode.HTML,
    )
    try:
        result = await asyncio.to_thread(
            apply_pending_thumbnail,
            thumbnail_id,
            job.auto_thumbnail_path,
            "auto",
        )
    except Exception as exc:
        logger.exception("Auto thumbnail upload failed")
        await query.edit_message_text(
            f"Thumbnail failed:\n<code>{html.escape(str(exc))}</code>",
            parse_mode=ParseMode.HTML,
            reply_markup=thumbnail_menu(thumbnail_id),
        )
        return

    await send_render_success(
        context.bot,
        chat_id or ADMIN_CHAT_ID,
        query.message.message_id,
        result,
    )


async def handle_thumbnail_upload(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id if update.effective_chat else None
    if not is_authorized_chat(chat_id):
        await send_unauthorized(update)
        return

    thumbnail_id = pending_thumbnail_by_chat.get(chat_id or 0)
    if not thumbnail_id:
        return

    job = pending_thumbnail_jobs.get(thumbnail_id)
    if job is None:
        pending_thumbnail_by_chat.pop(chat_id or 0, None)
        await update.effective_message.reply_text(
            "This thumbnail request is no longer available.",
            reply_markup=main_menu(),
        )
        return

    if update.effective_message.photo:
        file_id = update.effective_message.photo[-1].file_id
    elif update.effective_message.document and update.effective_message.document.mime_type:
        mime_type = update.effective_message.document.mime_type
        if not mime_type.startswith("image/"):
            return
        file_id = update.effective_message.document.file_id
    else:
        return

    incoming_path = job.workdir / "telegram_thumbnail_original"
    prepared_path = job.workdir / "telegram_thumbnail.jpg"

    upload_message = await update.effective_message.reply_text(
        "<b>Uploading thumbnail</b>\nPreparing your image for YouTube.",
        parse_mode=ParseMode.HTML,
    )
    try:
        telegram_file = await context.bot.get_file(file_id)
        await telegram_file.download_to_drive(custom_path=incoming_path)
        await asyncio.to_thread(prepare_thumbnail_image, incoming_path, prepared_path)
        result = await asyncio.to_thread(
            apply_pending_thumbnail,
            thumbnail_id,
            prepared_path,
            "Telegram",
        )
    except Exception as exc:
        logger.exception("Telegram thumbnail upload failed")
        await update.effective_message.reply_text(
            f"Thumbnail failed:\n<code>{html.escape(str(exc))}</code>",
            parse_mode=ParseMode.HTML,
            reply_markup=thumbnail_menu(thumbnail_id),
        )
        return

    await delete_chat_message(
        context.bot,
        chat_id or ADMIN_CHAT_ID,
        update.effective_message.message_id,
    )
    await send_render_success(
        context.bot,
        chat_id or ADMIN_CHAT_ID,
        upload_message.message_id,
        result,
    )


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

        await query.edit_message_text(
            format_progress_message("Starting"),
            parse_mode=ParseMode.HTML,
        )
        await run_telegram_render(
            context.bot,
            chat_id or ADMIN_CHAT_ID,
            query.message.message_id,
            on_busy=on_busy,
        )
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
            f"Thumbnail template: <code>{html.escape(str(THUMBNAIL_TEMPLATE))}</code>\n"
            f"FFmpeg: <code>{html.escape(FFMPEG_BIN)}</code>"
        )
        await query.edit_message_text(
            settings,
            parse_mode=ParseMode.HTML,
            reply_markup=main_menu(),
        )
        return

    await query.edit_message_text("Unknown menu action.", reply_markup=main_menu())
