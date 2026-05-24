"""Read common fields from a sheet row."""

from ..models import SheetRow

MONK_NAME_KEYS = ("moke_name", "monk_name", "monk", "speaker", "teacher", "sayadaw")
DURATION_KEYS = ("duration_min", "duration_minutes", "duration", "length_min", "length")


def get_required(row: SheetRow, key: str) -> str:
    value = row.values.get(key, "").strip()
    if not value:
        raise RuntimeError(f"Missing required '{key}' value in row {row.row_number}.")
    return value


def get_monk_name(row: SheetRow) -> str:
    for key in MONK_NAME_KEYS:
        value = row.values.get(key, "").strip()
        if value:
            return value
    return ""


def get_duration_min(row: SheetRow) -> str:
    for key in DURATION_KEYS:
        value = row.values.get(key, "").strip()
        if value:
            return value
    return "-"
