"""Shared job status constants and helpers (mirrors admin-panel/src/data/statusTheme.js)."""

JOB_STATUS_FILTER_KEYS = (
    "all",
    "done",
    "processing",
    "pending",
    "do",
    "scheduled",
    "failed",
)

DONE_STATUSES = frozenset({"uploaded_to_yt", "done"})


def is_done_status(status: str) -> bool:
    return status in DONE_STATUSES


def is_pending_status(status: str) -> bool:
    return status == "pending"
