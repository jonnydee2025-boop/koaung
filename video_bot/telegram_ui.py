import html
from typing import Any

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.error import BadRequest, TelegramError

from .config import (
    ADMIN_CHAT_ID,
    MENU_RENDER_NEXT,
    MENU_SETTINGS,
    MENU_STOP,
    MENU_VIEW_STATS,
    logger,
)
from .models import RenderTaskFailed


def main_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("Render next video", callback_data=MENU_RENDER_NEXT)],
            [
                InlineKeyboardButton("Sheet status", callback_data=MENU_VIEW_STATS),
                InlineKeyboardButton("Settings", callback_data=MENU_SETTINGS),
            ],
            [InlineKeyboardButton("Stop bot", callback_data=MENU_STOP)],
        ]
    )


def retry_menu(retry_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("Retry failed task", callback_data=f"retry:{retry_id}")],
            [InlineKeyboardButton("Sheet status", callback_data=MENU_VIEW_STATS)],
        ]
    )


def is_authorized_chat(chat_id: int | None) -> bool:
    return chat_id == ADMIN_CHAT_ID


async def send_unauthorized(update: Update) -> None:
    chat_id = update.effective_chat.id if update.effective_chat else None
    message = "Unauthorized. This bot is restricted to the configured admin."

    if update.callback_query:
        await update.callback_query.answer("Unauthorized", show_alert=True)
        if update.callback_query.message:
            await update.callback_query.message.reply_text(message)
    elif update.effective_message:
        await update.effective_message.reply_text(message)


def format_success_message(result: dict[str, str]) -> str:
    monk_name = result.get("monk_name") or "-"
    youtube_url = result.get("youtube_url") or result["url"]
    warning = result.get("thumbnail_warning")
    warning_note = f"\n\nThumbnail note: {html.escape(warning)}" if warning else ""
    return (
        "<b>Upload complete</b>\n"
        f"Title: {html.escape(result['title'])}\n"
        f"Monk name: {html.escape(monk_name)}\n"
        f"YouTube: {html.escape(youtube_url)}"
        f"{warning_note}"
    )


def success_reply_markup(result: dict[str, str]) -> InlineKeyboardMarkup:
    buttons: list[list[InlineKeyboardButton]] = []
    if result.get("youtube_url"):
        buttons.append(
            [
                InlineKeyboardButton("Open YouTube", url=result["youtube_url"]),
                InlineKeyboardButton("Edit in Studio", url=result["url"]),
            ]
        )

    buttons.extend(main_menu().inline_keyboard)
    return InlineKeyboardMarkup(buttons)


def format_failure_message(exc: Exception) -> str:
    error_text = str(exc)
    if len(error_text) > 1800:
        error_text = f"{error_text[:1800]}..."
    message = f"<b>Task failed</b>\n<code>{html.escape(error_text)}</code>"
    if isinstance(exc, RenderTaskFailed) and exc.retry_id:
        message += "\n\nCheck the error, then use the retry button when ready."
    return message


def failure_reply_markup(exc: Exception) -> InlineKeyboardMarkup:
    if isinstance(exc, RenderTaskFailed) and exc.retry_id:
        return retry_menu(exc.retry_id)
    return main_menu()


async def edit_progress_message(
    bot: Any,
    chat_id: int,
    message_id: int,
    text: str,
    parse_mode: str | None = ParseMode.HTML,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> None:
    try:
        await bot.edit_message_text(
            chat_id=chat_id,
            message_id=message_id,
            text=text,
            parse_mode=parse_mode,
            reply_markup=reply_markup,
        )
    except BadRequest as exc:
        if "message is not modified" not in str(exc).lower():
            logger.warning("Could not edit Telegram message: %s", exc)
    except TelegramError as exc:
        logger.warning("Could not edit Telegram message: %s", exc)
