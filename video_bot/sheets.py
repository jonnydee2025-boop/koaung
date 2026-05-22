from typing import Any

from .config import SHEET_NAME, SPREADSHEET_ID
from .google_services import build_google_services
from .models import SheetRow


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


def reserve_next_pending_row(sheets: Any) -> tuple[list[str], SheetRow | None]:
    headers, rows = get_sheet_rows(sheets)
    if "status" not in headers:
        raise RuntimeError("Missing required 'status' column.")

    for desired_status in ("do", "pending"):
        for row in rows:
            if row.values.get("status", "").strip().lower() == desired_status:
                update_task_status(sheets, headers, row.row_number, "processing", "")
                return headers, row

    return headers, None


def mark_row_failed(row_number: int, log_message: str) -> None:
    sheets, _ = build_google_services()
    headers, _ = get_sheet_rows(sheets)
    update_task_status(sheets, headers, row_number, "failed", log_message)


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
