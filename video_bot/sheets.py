from datetime import datetime, timezone
from typing import Any

from .config import SHEET_NAME, SPREADSHEET_ID
from .google_services import build_google_services
from .models import SheetRow
from .row_rules import is_batch_member_row
from .schedule_time import (
    normalize_schedule_time,
    read_row_schedule_time,
    schedule_time_storage_value,
    schedule_time_key,
)


def column_letter(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def normalize_header(header: str) -> str:
    return header.strip().lower()


def get_sheet_rows(sheets: Any) -> tuple[list[str], list[SheetRow]]:
    response = (
        sheets.spreadsheets()
        .values()
        .get(spreadsheetId=SPREADSHEET_ID, range=f"{SHEET_NAME}!A:Z")
        .execute()
    )
    values = response.get("values", [])
    if not values:
        raise RuntimeError("Google Sheet is empty.")

    headers = [normalize_header(value) for value in values[0]]
    rows: list[SheetRow] = []

    for offset, raw_row in enumerate(values[1:], start=2):
        padded = raw_row + [""] * (len(headers) - len(raw_row))
        rows.append(SheetRow(offset, dict(zip(headers, padded))))

    return headers, rows


def ensure_column(sheets: Any, headers: list[str], column_name: str) -> int:
    normalized = normalize_header(column_name)
    if normalized in headers:
        return headers.index(normalized) + 1

    next_index = len(headers) + 1
    sheets.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!{column_letter(next_index)}1",
        valueInputOption="RAW",
        body={"values": [[normalized]]},
    ).execute()
    headers.append(normalized)
    return next_index


def update_sheet_cell(sheets: Any, row_number: int, column_index: int, value: str) -> None:
    cell = f"{SHEET_NAME}!{column_letter(column_index)}{row_number}"
    sheets.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=cell,
        valueInputOption="RAW",
        body={"values": [[value]]},
    ).execute()


def update_task_status(
    sheets: Any,
    headers: list[str],
    row_number: int,
    status: str,
    log_message: str | None = None,
) -> None:
    status_col = ensure_column(sheets, headers, "status")
    update_sheet_cell(sheets, row_number, status_col, status)

    if log_message is not None:
        logs_col = ensure_column(sheets, headers, "logs")
        update_sheet_cell(sheets, row_number, logs_col, log_message[:45000])


def update_schedule_time(
    sheets: Any,
    headers: list[str],
    row_number: int,
    schedule_at: datetime,
) -> None:
    schedule_col = ensure_column(sheets, headers, "Schedule_Time")
    update_sheet_cell(
        sheets,
        row_number,
        schedule_col,
        schedule_time_storage_value(schedule_at),
    )


def find_schedule_time_conflict(
    rows: list[SheetRow],
    schedule_at: datetime,
    *,
    exclude_row_number: int | None = None,
) -> int | None:
    """Return another row number that already uses this exact schedule time, if any."""
    target_key = schedule_time_key(schedule_at)
    for row in rows:
        if exclude_row_number is not None and row.row_number == exclude_row_number:
            continue
        existing = read_row_schedule_time(row.values)
        if existing is not None and schedule_time_key(existing) == target_key:
            return row.row_number
    return None


def has_due_scheduled_row(rows: list[SheetRow], *, now: datetime | None = None) -> bool:
    moment = now or datetime.now(timezone.utc)
    for row in rows:
        if row.values.get("status", "").strip().lower() != "scheduled":
            continue
        scheduled_at = read_row_schedule_time(row.values)
        if scheduled_at is not None and scheduled_at <= moment:
            return True
    return False


def get_sheet_rows_by_numbers(
    rows: list[SheetRow],
    row_numbers: list[int],
) -> list[SheetRow]:
    """Return SheetRow objects in the order of row_numbers; raise if any row is missing."""
    by_number = {row.row_number: row for row in rows}
    result: list[SheetRow] = []
    for number in row_numbers:
        target = by_number.get(number)
        if target is None:
            raise RuntimeError(f"Sheet row {number} not found.")
        result.append(target)
    return result


def _row_eligible_for_queue(row: SheetRow) -> bool:
    if is_batch_member_row(row.row_number):
        return False
    return True


def reserve_next_pending_row(sheets: Any) -> tuple[list[str], SheetRow | None]:
    headers, rows = get_sheet_rows(sheets)
    if "status" not in headers:
        raise RuntimeError("Missing required 'status' column.")

    now = datetime.now(timezone.utc)
    due_scheduled: list[tuple[datetime, SheetRow]] = []
    for row in rows:
        if row.values.get("status", "").strip().lower() != "scheduled":
            continue
        scheduled_at = read_row_schedule_time(row.values)
        if scheduled_at is not None and scheduled_at <= now:
            due_scheduled.append((scheduled_at, row))

    if due_scheduled:
        due_scheduled.sort(key=lambda item: item[0])
        for _, candidate in due_scheduled:
            if _row_eligible_for_queue(candidate):
                update_task_status(
                    sheets, headers, candidate.row_number, "processing", ""
                )
                return headers, candidate

    for desired_status in ("do", "pending"):
        for row in rows:
            if row.values.get("status", "").strip().lower() != desired_status:
                continue
            if not _row_eligible_for_queue(row):
                continue
            update_task_status(sheets, headers, row.row_number, "processing", "")
            return headers, row

    return headers, None


def mark_row_failed(row_number: int, log_message: str) -> None:
    sheets, _ = build_google_services()
    headers, _ = get_sheet_rows(sheets)
    update_task_status(sheets, headers, row_number, "failed", log_message)


def _get_sheet_row_or_raise(sheets, row_number: int):
    headers, rows = get_sheet_rows(sheets)
    if "status" not in headers:
        raise RuntimeError("Missing required 'status' column.")

    target = next((r for r in rows if r.row_number == row_number), None)
    if target is None:
        raise ValueError(f"Sheet row {row_number} not found.")
    return headers, target


def assert_row_retryable(row_number: int) -> None:
    """Raise ValueError if the row cannot be retried from the admin panel."""
    sheets, _ = build_google_services()
    _, target = _get_sheet_row_or_raise(sheets, row_number)
    status = target.values.get("status", "").strip().lower()
    if status == "processing":
        raise ValueError(f"Row {row_number} is currently processing.")
    if status != "failed":
        raise ValueError(
            f"Row {row_number} is not failed (status: {status or 'empty'})."
        )


def prepare_failed_row_for_retry(sheets, row_number: int) -> tuple[list[str], "SheetRow"]:
    """
    Validate a failed row and mark it processing for an explicit admin-panel retry.
    Returns (headers, row). Raises ValueError if the row is missing or not retryable.
    """
    headers, target = _get_sheet_row_or_raise(sheets, row_number)
    status = target.values.get("status", "").strip().lower()
    if status == "processing":
        raise ValueError(f"Row {row_number} is currently processing.")
    if status != "failed":
        raise ValueError(
            f"Row {row_number} is not failed (status: {status or 'empty'})."
        )
    update_task_status(
        sheets,
        headers,
        row_number,
        "processing",
        "Retry from admin panel",
    )
    return headers, target


def prioritize_sheet_row(row_number: int) -> str:
    """
    Set a row's status to ``do`` so ``reserve_next_pending_row`` picks it before ``pending``.
    Returns the previous status (lowercase).
    """
    sheets, _ = build_google_services()
    headers, rows = get_sheet_rows(sheets)
    if "status" not in headers:
        raise RuntimeError("Missing required 'status' column.")

    target = next((r for r in rows if r.row_number == row_number), None)
    if target is None:
        raise ValueError(f"Sheet row {row_number} not found.")

    previous = target.values.get("status", "").strip().lower()
    if previous == "processing":
        raise ValueError(f"Row {row_number} is currently processing.")

    update_task_status(
        sheets,
        headers,
        row_number,
        "do",
        "Prioritized from admin panel",
    )
    return previous


def schedule_sheet_row(row_number: int, schedule_time_raw: str) -> dict[str, str]:
    """
    Set status to Scheduled and store Schedule_Time.
    Raises ValueError if row missing, processing, duplicate time, or invalid time.
    """
    schedule_at = normalize_schedule_time(schedule_time_raw)
    if schedule_at <= datetime.now(timezone.utc):
        raise ValueError("Schedule time must be in the future.")

    sheets, _ = build_google_services()
    headers, rows = get_sheet_rows(sheets)
    if "status" not in headers:
        raise RuntimeError("Missing required 'status' column.")

    target = next((r for r in rows if r.row_number == row_number), None)
    if target is None:
        raise ValueError(f"Sheet row {row_number} not found.")

    previous = target.values.get("status", "").strip().lower()
    if previous == "processing":
        raise ValueError(f"Row {row_number} is currently processing.")

    conflict_row = find_schedule_time_conflict(
        rows, schedule_at, exclude_row_number=row_number
    )
    if conflict_row is not None:
        raise ValueError(
            f"Schedule time already used by row {conflict_row}. "
            "Choose a different date and time."
        )

    update_schedule_time(sheets, headers, row_number, schedule_at)
    update_task_status(
        sheets,
        headers,
        row_number,
        "Scheduled",
        f"Scheduled for {schedule_time_storage_value(schedule_at)}",
    )
    stored = schedule_time_storage_value(schedule_at)
    return {
        "row": row_number,
        "status": "scheduled",
        "schedule_time": stored,
        "previous_status": previous,
    }


def get_status_statistics() -> dict[str, int]:
    sheets, _ = build_google_services()
    headers, rows = get_sheet_rows(sheets)
    if "status" not in headers:
        raise RuntimeError("Missing required 'status' column.")

    stats: dict[str, int] = {}
    for row in rows:
        status = row.values.get("status", "").strip().lower() or "blank"
        stats[status] = stats.get(status, 0) + 1

    stats["total_rows"] = len(rows)
    return stats
