"""Short-lived cache for full Google Sheet reads (jobs list + pagination)."""

import time
from typing import Any

from .google_services import build_google_services
from .models import SheetRow
from .sheets import get_sheet_rows

_CACHE_TTL_SECONDS = 30
_cache: dict[str, Any] | None = None


def get_cached_sheet_rows(*, force: bool = False) -> tuple[list[str], list[SheetRow]]:
    global _cache
    now = time.time()
    if (
        not force
        and _cache is not None
        and now - _cache["at"] < _CACHE_TTL_SECONDS
    ):
        return _cache["headers"], _cache["rows"]

    sheets, _ = build_google_services()
    headers, rows = get_sheet_rows(sheets)
    _cache = {"at": now, "headers": headers, "rows": rows}
    return headers, rows


def invalidate_sheet_cache() -> None:
    global _cache
    _cache = None
