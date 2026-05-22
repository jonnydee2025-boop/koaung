"""Map render progress callbacks to admin-panel-friendly current_render fields."""

import re

from .state import PROGRESS_HTML_PREFIX, current_render

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_tags(text: str) -> str:
    return _TAG_RE.sub("", text).strip()


def apply_progress_to_current_render(stage: str, pct: float | None = None) -> None:
    """
    Normalize progress updates for /api/render-status and the admin dashboard.
    Telegram HTML payloads are parsed into plain title, status, and percent.
    """
    if not stage.startswith(PROGRESS_HTML_PREFIX):
        current_render["status"] = stage
        if pct is not None:
            current_render["pct"] = round(pct, 1)
        return

    body = stage.removeprefix(PROGRESS_HTML_PREFIX)
    parsed_pct: float | None = None

    for line in body.splitlines():
        plain = _strip_tags(line)
        if not plain or plain == "WORKING":
            continue
        if plain.startswith("Title :"):
            current_render["title"] = plain.split(":", 1)[1].strip()
        elif plain.startswith("Monk :"):
            current_render["monk"] = plain.split(":", 1)[1].strip()
        elif plain.startswith("Duration :"):
            current_render["duration"] = plain.split(":", 1)[1].strip()
        elif plain.startswith("Status :"):
            current_render["status"] = plain.split(":", 1)[1].strip()
        elif plain.startswith("Progress :"):
            progress_text = plain.split(":", 1)[1].strip()
            match = re.search(r"([\d.]+)\s*%", progress_text)
            if match:
                parsed_pct = float(match.group(1))

    if parsed_pct is not None:
        current_render["pct"] = round(parsed_pct, 1)
    elif pct is not None:
        current_render["pct"] = round(pct, 1)
