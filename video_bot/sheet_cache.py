"""Cache for Google Sheet reads and serialized Jobs list data."""

from __future__ import annotations

import time
from typing import Any

from .google_services import build_sheets_service
from .models import SheetRow
from .sheets import get_sheet_rows

# Safety TTL when the sheet is edited outside this app (writes invalidate immediately).
_CACHE_TTL_SECONDS = 300
_cache: dict[str, Any] | None = None
_cache_generation = 0


def cache_generation() -> int:
    return _cache_generation


def get_cached_sheet_rows(*, force: bool = False) -> tuple[list[str], list[SheetRow]]:
    global _cache
    now = time.time()
    if (
        not force
        and _cache is not None
        and now - _cache["at"] < _CACHE_TTL_SECONDS
    ):
        return _cache["headers"], _cache["rows"]

    sheets = build_sheets_service()
    headers, rows = get_sheet_rows(sheets)
    _cache = {"at": now, "headers": headers, "rows": rows}
    return headers, rows


def invalidate_sheet_cache() -> None:
    """Drop cached sheet rows (and derived jobs memo via generation bump)."""
    global _cache, _cache_generation
    _cache = None
    _cache_generation += 1
