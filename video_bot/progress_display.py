"""Map render progress callbacks to admin-panel-friendly current_render fields."""

from .state import current_render


def apply_progress_to_current_render(stage: str, pct: float | None = None) -> None:
    """Normalize progress updates for /api/render-status and the admin dashboard."""
    current_render["status"] = stage
    if pct is not None:
        current_render["pct"] = round(pct, 1)


def admin_progress_callback(status: str, pct: float | None = None) -> None:
    apply_progress_to_current_render(status, pct)
