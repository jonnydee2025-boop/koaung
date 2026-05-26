from datetime import datetime, timezone
from typing import Any

from .config import SHEET_NAME, SPREADSHEET_ID, logger
from .google_services import build_google_services
from .models import SheetRow
from .row_rules import (
    RowRangeRule,
    get_batch_rule_for_anchor,
    is_batch_member_row,
    parse_batch_rows,
    resolve_batch_anchor_row,
)
from .repeat_jobs import (
    RepeatJob,
    compute_next_run,
    delete_repeat_job,
    get_repeat_job,
    load_repeat_jobs,
    repeat_job_description,
    save_repeat_job,
)
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


def _normalize_row_status(values: dict[str, str]) -> str:
    return values.get("status", "").strip().lower()


def _rule_has_media(rule: RowRangeRule) -> bool:
    return bool(rule.background_video_id or rule.thumbnail_file_id)


def auto_trigger_do_for_row_rules(
    rules: list[RowRangeRule],
    *,
    sheets: Any | None = None,
) -> dict[str, list[int]]:
    """Set sheet rows to do when a saved rule assigns background or thumbnail."""
    target_rows: list[int] = []
    seen: set[int] = set()
    for rule in rules:
        if not _rule_has_media(rule):
            continue
        for row_number in parse_batch_rows(rule):
            if row_number not in seen:
                seen.add(row_number)
                target_rows.append(row_number)

    if not target_rows:
        return {"auto_do_rows": []}

    if sheets is None:
        sheets, _ = build_google_services()

    headers, sheet_rows = get_sheet_rows(sheets)
    by_number = {row.row_number: row for row in sheet_rows}
    updated: list[int] = []

    for row_number in target_rows:
        row = by_number.get(row_number)
        if row is None:
            logger.warning("Row rules auto-do: sheet row %s not found, skipping", row_number)
            continue
        if _normalize_row_status(row.values) == "scheduled":
            logger.info(
                "Row rules auto-do: row %s is scheduled, keeping status",
                row_number,
            )
            continue
        if _normalize_row_status(row.values) == "repeat":
            logger.info(
                "Row rules auto-do: row %s is repeat, keeping status",
                row_number,
            )
            continue
        if _normalize_row_status(row.values) == "do":
            continue
        update_task_status(sheets, headers, row_number, "do")
        updated.append(row_number)
        logger.info("Row rules auto-do: set row %s to do", row_number)

    return {"auto_do_rows": updated}


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
    return bool(_collect_due_scheduled_anchors(rows, moment))


def has_do_row(rows: list[SheetRow]) -> bool:
    return bool(_collect_do_anchor_candidates(rows))


def _resolve_do_anchor(row: SheetRow, rows_by_number: dict[int, SheetRow]) -> SheetRow | None:
    anchor_number = resolve_batch_anchor_row(row.row_number)
    anchor = rows_by_number.get(anchor_number)
    if anchor is None:
        return None
    if anchor_number != row.row_number:
        logger.info(
            "Do row %s is batch member — using anchor row %s",
            row.row_number,
            anchor_number,
        )
    if _normalize_row_status(anchor.values) in ("scheduled", "repeat"):
        return None
    if not _row_eligible_for_queue(anchor):
        return None
    return anchor


def _collect_do_anchor_candidates(rows: list[SheetRow]) -> list[SheetRow]:
    rows_by_number = _sheet_row_map(rows)
    seen: set[int] = set()
    anchors: list[SheetRow] = []
    for row in rows:
        if row.values.get("status", "").strip().lower() != "do":
            continue
        anchor = _resolve_do_anchor(row, rows_by_number)
        if anchor is None or anchor.row_number in seen:
            continue
        seen.add(anchor.row_number)
        anchors.append(anchor)
    return sorted(anchors, key=lambda item: item.row_number)


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


def _sheet_row_map(rows: list[SheetRow]) -> dict[int, SheetRow]:
    return {row.row_number: row for row in rows}


def _resolve_scheduled_candidate(
    row: SheetRow,
    rows_by_number: dict[int, SheetRow],
) -> SheetRow | None:
    anchor_number = resolve_batch_anchor_row(row.row_number)
    anchor = rows_by_number.get(anchor_number)
    if anchor is None:
        return None
    if anchor_number != row.row_number:
        logger.info(
            "Scheduled row %s is batch member — using anchor row %s",
            row.row_number,
            anchor_number,
        )
    if not _row_eligible_for_queue(anchor):
        return None
    return anchor


def _collect_due_timed_anchors(
    rows: list[SheetRow],
    moment: datetime,
) -> list[tuple[datetime, SheetRow]]:
    rows_by_number = _sheet_row_map(rows)
    best_by_anchor: dict[int, tuple[datetime, SheetRow]] = {}
    for row in rows:
        status = row.values.get("status", "").strip().lower()
        if status not in ("scheduled", "repeat"):
            continue
        scheduled_at = read_row_schedule_time(row.values)
        if scheduled_at is None or scheduled_at > moment:
            continue
        anchor = _resolve_scheduled_candidate(row, rows_by_number)
        if anchor is None:
            continue
        existing = best_by_anchor.get(anchor.row_number)
        if existing is None or scheduled_at < existing[0]:
            best_by_anchor[anchor.row_number] = (scheduled_at, anchor)
    return sorted(best_by_anchor.values(), key=lambda item: item[0])


def _collect_due_scheduled_anchors(
    rows: list[SheetRow],
    moment: datetime,
) -> list[tuple[datetime, SheetRow]]:
    return _collect_due_timed_anchors(rows, moment)


def reserve_next_do_row(sheets: Any) -> tuple[list[str], SheetRow | None]:
    """Reserve the next do row only (never scheduled); batch members resolve to anchor."""
    headers, rows = get_sheet_rows(sheets)
    if "status" not in headers:
        raise RuntimeError("Missing required 'status' column.")

    candidates = _collect_do_anchor_candidates(rows)
    if not candidates:
        return headers, None

    candidate = candidates[0]
    update_task_status(sheets, headers, candidate.row_number, "processing", "")
    return headers, candidate


def reserve_next_pending_row(sheets: Any) -> tuple[list[str], SheetRow | None]:
    """Reserve the next render row: due Scheduled first, then do (never pending)."""
    headers, rows = get_sheet_rows(sheets)
    if "status" not in headers:
        raise RuntimeError("Missing required 'status' column.")

    now = datetime.now(timezone.utc)
    due_scheduled = _collect_due_scheduled_anchors(rows, now)

    if due_scheduled:
        _, candidate = due_scheduled[0]
        update_task_status(
            sheets, headers, candidate.row_number, "processing", ""
        )
        return headers, candidate

    do_candidates = _collect_do_anchor_candidates(rows)
    if do_candidates:
        candidate = do_candidates[0]
        update_task_status(sheets, headers, candidate.row_number, "processing", "")
        return headers, candidate

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


ADMIN_SETTABLE_STATUSES = frozenset({"pending", "do", "failed", "done"})


def clear_schedule_time(sheets: Any, headers: list[str], row_number: int) -> None:
    schedule_col = ensure_column(sheets, headers, "Schedule_Time")
    update_sheet_cell(sheets, row_number, schedule_col, "")


def update_sheet_row_status(row_number: int, status: str) -> dict[str, str | int]:
    """
    Set a row's status from the admin panel.
    Allowed values: pending, do, failed, done.
    """
    normalized = (status or "").strip().lower()
    if normalized not in ADMIN_SETTABLE_STATUSES:
        raise ValueError(
            f"Invalid status: {status}. Allowed: {', '.join(sorted(ADMIN_SETTABLE_STATUSES))}."
        )

    sheets, _ = build_google_services()
    headers, target = _get_sheet_row_or_raise(sheets, row_number)
    previous = target.values.get("status", "").strip().lower()
    if previous == "processing":
        raise ValueError(f"Row {row_number} is currently processing.")

    if previous in ("scheduled", "repeat"):
        clear_schedule_time(sheets, headers, row_number)
        delete_repeat_job(row_number)

    update_task_status(
        sheets,
        headers,
        row_number,
        normalized,
        f"Status set to {normalized} from admin panel",
    )
    return {
        "row": row_number,
        "status": normalized,
        "previous_status": previous,
    }


def _clear_batch_member_schedules(
    anchor_number: int,
    *,
    sheets: Any,
    headers: list[str],
    rows: list[SheetRow],
) -> None:
    """Reset scheduled batch members so only the anchor holds the schedule."""
    batch = get_batch_rule_for_anchor(anchor_number)
    if batch is None:
        return
    _, batch_rows = batch
    for member_number in batch_rows[1:]:
        member = next((row for row in rows if row.row_number == member_number), None)
        if member is None:
            continue
        if _normalize_row_status(member.values) != "scheduled":
            continue
        clear_schedule_time(sheets, headers, member_number)
        update_task_status(
            sheets,
            headers,
            member_number,
            "pending",
            "Schedule applied to batch anchor row",
        )


def find_time_slot_conflict_once(
    rows: list[SheetRow],
    schedule_at: datetime,
    *,
    exclude_anchor: int | None = None,
) -> str | None:
    conflict = find_schedule_time_conflict(
        rows, schedule_at, exclude_row_number=exclude_anchor
    )
    if conflict is not None:
        return (
            f"Schedule time already used by row {conflict}. "
            "Choose a different date and time."
        )
    for anchor, job in load_repeat_jobs().items():
        if exclude_anchor is not None and anchor == exclude_anchor:
            continue
        from .repeat_jobs import local_time_matches_repeat

        if local_time_matches_repeat(job, schedule_at):
            return (
                f"Time slot used by row #{anchor} — {repeat_job_description(job)}. "
                "Choose a different date and time."
            )
    return None


def find_time_slot_conflict_repeat(
    rows: list[SheetRow],
    job: RepeatJob,
    *,
    exclude_anchor: int | None = None,
) -> str | None:
    from .repeat_jobs import local_time_matches_repeat, repeat_jobs_overlap

    for anchor, other in load_repeat_jobs().items():
        if exclude_anchor is not None and anchor == exclude_anchor:
            continue
        if repeat_jobs_overlap(job, other):
            return (
                f"Time slot used by row #{anchor} — {repeat_job_description(other)}. "
                "Choose a different time."
            )
    for row in rows:
        if exclude_anchor is not None and row.row_number == exclude_anchor:
            continue
        if _normalize_row_status(row.values) != "scheduled":
            continue
        existing = read_row_schedule_time(row.values)
        if existing is not None and local_time_matches_repeat(job, existing):
            return (
                f"Schedule on row #{row.row_number} conflicts with this repeat time. "
                "Choose a different time."
            )
    return None


def reschedule_repeat_anchor_after_upload(
    sheets: Any,
    headers: list[str],
    anchor_row: int,
    log_message: str,
) -> None:
    """After a successful repeat render, set anchor to repeat with next Schedule_Time."""
    job = get_repeat_job(anchor_row)
    if job is None:
        raise RuntimeError(f"No repeat config for anchor row {anchor_row}.")
    next_run = compute_next_run(job, after=datetime.now(timezone.utc))
    update_schedule_time(sheets, headers, anchor_row, next_run)
    update_task_status(
        sheets,
        headers,
        anchor_row,
        "repeat",
        f"{log_message} Next repeat: {schedule_time_storage_value(next_run)}.",
    )


def schedule_job_row(
    row_number: int,
    *,
    mode: str = "once",
    schedule_time_raw: str | None = None,
    repeat_type: str = "daily",
    repeat_time: str = "07:00",
    days_of_week: list[int] | None = None,
    timezone: str = "UTC",
) -> dict[str, str | int | bool]:
    if mode == "repeat":
        return schedule_sheet_row_repeat(
            row_number,
            repeat_type=repeat_type,
            repeat_time=repeat_time,
            days_of_week=days_of_week or [],
            job_timezone=timezone,
        )
    if not schedule_time_raw:
        raise ValueError("Schedule time is required for one-time schedule.")
    return schedule_sheet_row_once(row_number, schedule_time_raw)


def schedule_sheet_row_once(row_number: int, schedule_time_raw: str) -> dict[str, str | int | bool]:
    """
    Set status to Scheduled and store Schedule_Time.
    Batch member rows schedule the anchor (first Select Rows row) instead.
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

    if target.values.get("status", "").strip().lower() == "processing":
        raise ValueError(f"Row {row_number} is currently processing.")

    anchor_number = resolve_batch_anchor_row(row_number)
    redirected = anchor_number != row_number
    if redirected:
        logger.info(
            "Scheduling batch member row %s — using anchor row %s",
            row_number,
            anchor_number,
        )

    anchor = next((r for r in rows if r.row_number == anchor_number), None)
    if anchor is None:
        raise ValueError(f"Sheet row {anchor_number} not found.")

    if anchor.values.get("status", "").strip().lower() == "processing":
        raise ValueError(f"Row {anchor_number} is currently processing.")

    conflict_message = find_time_slot_conflict_once(
        rows, schedule_at, exclude_anchor=anchor_number
    )
    if conflict_message is not None:
        raise ValueError(conflict_message)

    _clear_batch_member_schedules(
        anchor_number,
        sheets=sheets,
        headers=headers,
        rows=rows,
    )

    delete_repeat_job(anchor_number)
    previous = anchor.values.get("status", "").strip().lower()
    update_schedule_time(sheets, headers, anchor_number, schedule_at)
    update_task_status(
        sheets,
        headers,
        anchor_number,
        "Scheduled",
        f"Scheduled for {schedule_time_storage_value(schedule_at)}",
    )
    stored = schedule_time_storage_value(schedule_at)
    return {
        "row": anchor_number,
        "requested_row": row_number,
        "redirected_to_anchor": redirected,
        "status": "scheduled",
        "mode": "once",
        "schedule_time": stored,
        "previous_status": previous,
    }


def schedule_sheet_row_repeat(
    row_number: int,
    *,
    repeat_type: str,
    repeat_time: str,
    days_of_week: list[int],
    job_timezone: str,
) -> dict[str, str | int | bool]:
    """Set anchor to repeat status with next Schedule_Time from repeat config."""
    sheets, _ = build_google_services()
    headers, rows = get_sheet_rows(sheets)
    if "status" not in headers:
        raise RuntimeError("Missing required 'status' column.")

    target = next((r for r in rows if r.row_number == row_number), None)
    if target is None:
        raise ValueError(f"Sheet row {row_number} not found.")

    if target.values.get("status", "").strip().lower() == "processing":
        raise ValueError(f"Row {row_number} is currently processing.")

    anchor_number = resolve_batch_anchor_row(row_number)
    redirected = anchor_number != row_number
    if redirected:
        logger.info(
            "Repeat on batch member row %s — using anchor row %s",
            row_number,
            anchor_number,
        )

    anchor = next((r for r in rows if r.row_number == anchor_number), None)
    if anchor is None:
        raise ValueError(f"Sheet row {anchor_number} not found.")

    if anchor.values.get("status", "").strip().lower() == "processing":
        raise ValueError(f"Row {anchor_number} is currently processing.")

    repeat_job = RepeatJob(
        anchor_row=anchor_number,
        repeat_type=repeat_type,  # type: ignore[arg-type]
        time=repeat_time,
        days_of_week=list(days_of_week),
        timezone=job_timezone,
    )

    conflict_message = find_time_slot_conflict_repeat(
        rows, repeat_job, exclude_anchor=anchor_number
    )
    if conflict_message is not None:
        raise ValueError(conflict_message)

    _clear_batch_member_schedules(
        anchor_number,
        sheets=sheets,
        headers=headers,
        rows=rows,
    )

    next_run = compute_next_run(repeat_job, after=datetime.now(timezone.utc))
    save_repeat_job(repeat_job)
    previous = anchor.values.get("status", "").strip().lower()
    update_schedule_time(sheets, headers, anchor_number, next_run)
    update_task_status(
        sheets,
        headers,
        anchor_number,
        "repeat",
        f"Repeat {repeat_type} at {repeat_time} {job_timezone}. "
        f"Next: {schedule_time_storage_value(next_run)}",
    )
    stored = schedule_time_storage_value(next_run)
    return {
        "row": anchor_number,
        "requested_row": row_number,
        "redirected_to_anchor": redirected,
        "status": "repeat",
        "mode": "repeat",
        "schedule_time": stored,
        "repeat_type": repeat_type,
        "repeat_time": repeat_time,
        "timezone": job_timezone,
        "previous_status": previous,
    }


def schedule_sheet_row(row_number: int, schedule_time_raw: str) -> dict[str, str | int | bool]:
    """Backward-compatible one-time schedule entry point."""
    return schedule_sheet_row_once(row_number, schedule_time_raw)


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
