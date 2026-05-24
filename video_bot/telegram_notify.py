"""Send final render success/failure messages to the admin Telegram chat."""

from telegram.constants import ParseMode

from .config import ADMIN_CHAT_ID, logger
from .telegram_ui import (
    failure_reply_markup,
    format_failure_message,
    format_success_message,
    main_menu,
    success_reply_markup,
)
import video_bot.state as state


def _get_bot():
    app = state.telegram_app
    if app is None or app.bot is None:
        logger.warning("Telegram app unavailable; skipping render notification.")
        return None
    return app.bot


async def notify_render_success(result: dict[str, str]) -> None:
    bot = _get_bot()
    if bot is None:
        return
    await bot.send_message(
        chat_id=ADMIN_CHAT_ID,
        text=format_success_message(result),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
        reply_markup=success_reply_markup(result),
    )


async def notify_render_failure(exc: Exception) -> None:
    bot = _get_bot()
    if bot is None:
        return
    await bot.send_message(
        chat_id=ADMIN_CHAT_ID,
        text=format_failure_message(exc),
        parse_mode=ParseMode.HTML,
        reply_markup=failure_reply_markup(exc),
    )


async def notify_no_pending_rows() -> None:
    bot = _get_bot()
    if bot is None:
        return
    await bot.send_message(
        chat_id=ADMIN_CHAT_ID,
        text="No do or pending rows found.",
        reply_markup=main_menu(),
    )
