"""Parse and compare schedule_time values stored in the Google Sheet."""

from datetime import datetime, timezone


def normalize_schedule_time(raw: str) -> datetime:
    """Parse sheet/API value to UTC; raises ValueError if empty or invalid."""
    text = (raw or "").strip()
    if not text:
        raise ValueError("Schedule time is required.")

    if text.endswith("Z"):
        text = text[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"Invalid schedule time: {raw}") from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(second=0, microsecond=0)


def schedule_time_key(dt: datetime) -> str:
    """Canonical string for duplicate detection (UTC, minute precision)."""
    return normalize_schedule_time(dt.isoformat()).isoformat()


def schedule_time_storage_value(dt: datetime) -> str:
    """Value written to the Schedule_Time column."""
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def parse_optional_utc_iso(raw: str) -> datetime | None:
    """Parse ISO datetime to UTC, or return None if empty/invalid."""
    text = (raw or "").strip().rstrip(".")
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _schedule_time_keys(row_values: dict[str, str]) -> list[str]:
    keys: list[str] = []
    for key in row_values:
        normalized = key.strip().lower().replace(" ", "_").replace("-", "_")
        if normalized == "schedule_time" and key not in keys:
            keys.append(key)
    if "schedule_time" not in keys:
        keys.insert(0, "schedule_time")
    return keys


def read_row_schedule_time(row_values: dict[str, str]) -> datetime | None:
    for key in _schedule_time_keys(row_values):
        raw = row_values.get(key, "").strip()
        if not raw:
            continue
        try:
            return normalize_schedule_time(raw)
        except ValueError:
            continue
    return None
