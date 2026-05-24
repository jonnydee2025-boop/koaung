"""Render progress callback wiring."""

from ..models import SheetRow
from ..state import ProgressCallback


def row_progress_callback(
    row: SheetRow,
    title: str,
    monk_name: str,
    progress_callback: ProgressCallback | None,
) -> ProgressCallback | None:
    if progress_callback is None:
        return None

    def callback(status: str, percent: float | None = None) -> None:
        progress_callback(status, percent)

    return callback
