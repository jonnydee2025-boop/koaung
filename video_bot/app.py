import asyncio
import atexit
import html
import signal

import uvicorn
from telegram import Update
from telegram.constants import ParseMode
from telegram.error import Conflict
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from .api import app as fastapi_app
from .config import ADMIN_CHAT_ID, API_HOST, API_PORT, BOT_TOKEN, logger, validate_startup
from .render_cleanup import cleanup_active_render
from .handlers import (
    handle_menu_button,
    handle_retry_button,
    handle_thumbnail_button,
    handle_thumbnail_upload,
    render_next,
    start,
)
import video_bot.state as _state


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    if isinstance(context.error, Conflict):
        logger.error(
            "Telegram polling conflict: another copy of this bot is already running. "
            "Stop the other process and start this bot again."
        )
        context.application.stop_running()
        return

    logger.exception("Telegram handler error", exc_info=context.error)
    await context.bot.send_message(
        chat_id=ADMIN_CHAT_ID,
        text=f"Telegram handler error:\n<code>{html.escape(str(context.error))}</code>",
        parse_mode=ParseMode.HTML,
    )


def _install_shutdown_handlers() -> None:
    def on_exit(signum: int, _frame: object) -> None:
        logger.info("Shutdown signal %s — cleaning up in-flight render.", signum)
        cleanup_active_render("Bot shut down — render interrupted")

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, on_exit)
        except (ValueError, OSError):
            pass

    atexit.register(
        lambda: cleanup_active_render("Process exited — render interrupted")
    )


def main() -> None:
    validate_startup()
    _install_shutdown_handlers()

    application = Application.builder().token(BOT_TOKEN).build()
    _state.telegram_app = application  # expose to API bot-control endpoints
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("render_next", render_next))
    application.add_handler(CallbackQueryHandler(handle_retry_button, pattern=r"^retry:"))
    application.add_handler(CallbackQueryHandler(handle_thumbnail_button, pattern=r"^thumb:"))
    application.add_handler(CallbackQueryHandler(handle_menu_button, pattern=r"^menu:"))
    application.add_handler(
        MessageHandler(filters.PHOTO | filters.Document.IMAGE, handle_thumbnail_upload)
    )
    application.add_error_handler(error_handler)

    # Run FastAPI and Telegram bot together in the same event loop.
    # If Telegram is temporarily unreachable, keep the admin API online.
    async def run_both() -> None:
        uv_config = uvicorn.Config(
            fastapi_app,
            host=API_HOST,
            port=API_PORT,
            log_level="warning",
        )
        uv_server = uvicorn.Server(uv_config)

        logger.info("Admin API starting on http://%s:%s", API_HOST, API_PORT)
        logger.info("Swagger UI: http://localhost:%s/docs", API_PORT)

        telegram_initialized = False
        telegram_started = False
        api_task = asyncio.create_task(uv_server.serve())

        try:
            try:
                await application.initialize()
                telegram_initialized = True
                await application.start()
                await application.updater.start_polling(allowed_updates=Update.ALL_TYPES)
                telegram_started = True
                logger.info("Bot is running. Open Telegram and press /start.")
            except Exception as exc:
                logger.error(
                    "Telegram bot unavailable; admin API will keep running: %s",
                    exc,
                )

            # Block here until Ctrl-C / SIGTERM or until the API server exits.
            await api_task

            # Graceful shutdown
            if telegram_started:
                await application.updater.stop()
                await application.stop()
        finally:
            cleanup_active_render("Bot shut down — render interrupted")
            if telegram_initialized:
                await application.shutdown()
            if not api_task.done():
                uv_server.should_exit = True
                await api_task

    asyncio.run(run_both())
