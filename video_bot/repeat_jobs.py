"""Per-anchor repeat schedule config (Jobs → Schedule → Repeat)."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .config import REPEAT_JOBS_PATH, logger
from .schedule_time import parse_optional_utc_iso, read_row_schedule_time

KNOWN_TIMEZONES = (
    "UTC",
    "Asia/Yangon",
    "Asia/Bangkok",
    "Asia/Singapore",
    "Asia/Kolkata",
    "Asia/Tokyo",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
)

RepeatType = Literal["daily", "weekly"]
TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
REPEAT_LOG_PATTERN = re.compile(
    r"repeat\s+(daily|weekly)\s+at\s+(\d{1,2}:\d{2})\s+([A-Za-z0-9_/+-]+)",
    re.IGNORECASE,
)
NEXT_REPEAT_LOG = re.compile(
    r"Next repeat:\s*([0-9T:.+-]+Z?)",
    re.IGNORECASE,
)
DEFAULT_WEEKLY_DAYS = [0, 1, 2, 3, 4]
DEFAULT_REPEAT_TIMEZONE = "Asia/Yangon"


@dataclass
class RepeatThumbnail:
    file_id: str
    name: str = ""


@dataclass
class RepeatJob:
    anchor_row: int
    repeat_type: RepeatType
    time: str = "07:00"
    days_of_week: list[int] = field(default_factory=list)
    timezone: str = "UTC"
    """Ordered thumbnails: run N uses thumbnails[N] (0-based). Empty slots after the list."""
    thumbnails: list[RepeatThumbnail] = field(default_factory=list)
    """Successful uploads completed; next render uses thumbnails[run_count]."""
    run_count: int = 0


def _parse_time(text: str) -> tuple[int, int]:
    match = TIME_RE.match((text or "").strip())
    if not match:
        raise ValueError(f"Invalid time {text!r}; use HH:MM (24-hour).")
    return int(match.group(1)), int(match.group(2))


def _zoneinfo(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"Unknown timezone: {name!r}") from exc


def _parse_repeat_thumbnails(raw: Any) -> list[RepeatThumbnail]:
    if not isinstance(raw, list):
        return []
    items: list[RepeatThumbnail] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        file_id = str(entry.get("file_id") or entry.get("thumbnail_file_id") or "").strip()
        if not file_id:
            continue
        items.append(
            RepeatThumbnail(
                file_id=file_id,
                name=str(entry.get("name") or entry.get("thumbnail_name") or "").strip(),
            )
        )
    return items


def repeat_run_has_thumbnail(job: RepeatJob) -> bool:
    index = max(job.run_count, 0)
    if index >= len(job.thumbnails):
        return False
    return bool(job.thumbnails[index].file_id.strip())


def repeat_thumbnail_for_run(job: RepeatJob) -> RepeatThumbnail | None:
    index = max(job.run_count, 0)
    if index >= len(job.thumbnails):
        return None
    thumb = job.thumbnails[index]
    if not thumb.file_id.strip():
        return None
    return thumb


def bump_repeat_run_count(anchor_row: int) -> None:
    job = load_repeat_jobs().get(anchor_row)
    if job is None:
        return
    job.run_count += 1
    save_repeat_job(job)


def _repeat_from_dict(data: dict[str, Any]) -> RepeatJob:
    repeat_type = str(data.get("repeat_type", "daily")).strip().lower()
    if repeat_type not in ("daily", "weekly"):
        raise ValueError(f"Invalid repeat_type: {repeat_type!r}")
    raw_days = data.get("days_of_week", [])
    days: list[int] = []
    if isinstance(raw_days, list):
        for item in raw_days:
            day = int(item)
            if day < 0 or day > 6:
                raise ValueError(f"days_of_week values must be 0-6 (Mon-Sun), got {day}.")
            if day not in days:
                days.append(day)
    anchor_row = int(data.get("anchor_row", 0))
    if anchor_row < 1:
        raise ValueError("anchor_row is required.")
    run_count_raw = data.get("run_count", 0)
    try:
        run_count = max(0, int(run_count_raw))
    except (TypeError, ValueError):
        run_count = 0

    return RepeatJob(
        anchor_row=anchor_row,
        repeat_type=repeat_type,  # type: ignore[arg-type]
        time=str(data.get("time") or "07:00").strip(),
        days_of_week=days,
        timezone=str(data.get("timezone") or "UTC").strip() or "UTC",
        thumbnails=_parse_repeat_thumbnails(data.get("thumbnails")),
        run_count=run_count,
    )


def validate_repeat_job(job: RepeatJob) -> None:
    _zoneinfo(job.timezone)
    _parse_time(job.time)
    if job.repeat_type == "weekly" and not job.days_of_week:
        raise ValueError("Select at least one weekday for weekly repeat.")


def load_repeat_jobs() -> dict[int, RepeatJob]:
    if not REPEAT_JOBS_PATH.is_file():
        return {}
    try:
        payload = json.loads(REPEAT_JOBS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Could not read repeat jobs file: %s", exc)
        return {}
    raw = payload.get("jobs", payload if isinstance(payload, dict) else {})
    if not isinstance(raw, dict):
        return {}
    jobs: dict[int, RepeatJob] = {}
    for key, item in raw.items():
        if not isinstance(item, dict):
            continue
        try:
            job = _repeat_from_dict({**item, "anchor_row": int(key)})
            validate_repeat_job(job)
            jobs[job.anchor_row] = job
        except (ValueError, TypeError) as exc:
            logger.warning("Skipping invalid repeat job %s: %s", key, exc)
    return jobs


def _build_repeat_job_from_match(
    match: re.Match[str],
    anchor_row: int,
) -> RepeatJob | None:
    repeat_type = match.group(1).strip().lower()
    repeat_time = match.group(2).strip()
    timezone_name = match.group(3).strip()
    try:
        job = RepeatJob(
            anchor_row=anchor_row,
            repeat_type=repeat_type,  # type: ignore[arg-type]
            time=repeat_time,
            days_of_week=list(DEFAULT_WEEKLY_DAYS) if repeat_type == "weekly" else [],
            timezone=timezone_name,
        )
        validate_repeat_job(job)
        return job
    except ValueError as exc:
        logger.debug(
            "Could not parse repeat config for row %s from logs: %s",
            anchor_row,
            exc,
        )
        return None


def infer_repeat_job_from_next_run(
    anchor_row: int,
    next_run: datetime,
    *,
    default_timezone: str = DEFAULT_REPEAT_TIMEZONE,
) -> RepeatJob:
    """Best-effort daily repeat when only the next Schedule_Time / log timestamp exists."""
    if next_run.tzinfo is None:
        next_run = next_run.replace(tzinfo=timezone.utc)
    moment = next_run.astimezone(timezone.utc)
    local = moment.astimezone(_zoneinfo(default_timezone))
    return RepeatJob(
        anchor_row=anchor_row,
        repeat_type="daily",
        time=f"{local.hour:02d}:{local.minute:02d}",
        days_of_week=[],
        timezone=default_timezone,
    )


def parse_repeat_job_from_logs(logs: str, anchor_row: int) -> RepeatJob | None:
    """Rebuild repeat config from sheet logs (schedule line or post-upload next run)."""
    if not logs or anchor_row < 1:
        return None

    match = None
    for line in logs.splitlines():
        found = REPEAT_LOG_PATTERN.search(line)
        if found is not None:
            match = found
    if match is not None:
        return _build_repeat_job_from_match(match, anchor_row)

    for line in logs.splitlines():
        found = NEXT_REPEAT_LOG.search(line)
        if found is None:
            continue
        next_run = parse_optional_utc_iso(found.group(1))
        if next_run is not None:
            return infer_repeat_job_from_next_run(anchor_row, next_run)
    return None


def repeat_job_for_row(
    row_number: int,
    *,
    status: str,
    logs: str = "",
    schedule_time: str = "",
    repair: bool = False,
) -> RepeatJob | None:
    """Resolve repeat config for a sheet row (JSON, logs, or Schedule_Time)."""
    if (status or "").strip().lower() != "repeat":
        return None
    return resolve_repeat_job(
        row_number,
        logs=logs,
        schedule_time=schedule_time,
        repair=repair,
    )


def resolve_repeat_job(
    anchor_row: int,
    *,
    logs: str = "",
    schedule_time: str = "",
    repair: bool = False,
) -> RepeatJob | None:
    """Load repeat config from JSON, or recover from sheet logs / Schedule_Time."""
    job = load_repeat_jobs().get(anchor_row)
    if job is not None:
        return job

    recovered = parse_repeat_job_from_logs(logs, anchor_row)
    if recovered is None and schedule_time.strip():
        next_run = parse_optional_utc_iso(schedule_time)
        if next_run is not None:
            recovered = infer_repeat_job_from_next_run(anchor_row, next_run)

    if recovered is None:
        return None

    if repair:
        try:
            save_repeat_job(recovered)
            logger.info(
                "Recovered repeat_jobs.json entry for row %s from sheet data",
                anchor_row,
            )
        except OSError as exc:
            logger.warning(
                "Recovered repeat config for row %s but could not save repeat_jobs.json: %s",
                anchor_row,
                exc,
            )
    return recovered


def get_repeat_job(anchor_row: int) -> RepeatJob | None:
    return load_repeat_jobs().get(anchor_row)


def repair_missing_repeat_jobs_from_sheet() -> int:
    """Persist repeat_jobs.json entries recovered from repeat rows on the sheet."""
    from .sheet_cache import get_cached_sheet_rows

    _, rows = get_cached_sheet_rows()
    repaired = 0
    for row in rows:
        status = row.values.get("status", "").strip().lower()
        if status != "repeat" or get_repeat_job(row.row_number) is not None:
            continue
        schedule_dt = read_row_schedule_time(row.values)
        schedule_time = schedule_dt.isoformat() if schedule_dt else ""
        if repeat_job_for_row(
            row.row_number,
            status=status,
            logs=row.values.get("logs", "") or "",
            schedule_time=schedule_time,
            repair=True,
        ):
            repaired += 1
    return repaired


def save_repeat_job(job: RepeatJob) -> None:
    validate_repeat_job(job)
    jobs = load_repeat_jobs()
    jobs[job.anchor_row] = job
    _write_jobs(jobs)


def delete_repeat_job(anchor_row: int) -> None:
    jobs = load_repeat_jobs()
    if anchor_row not in jobs:
        return
    del jobs[anchor_row]
    _write_jobs(jobs)


def _write_jobs(jobs: dict[int, RepeatJob]) -> None:
    REPEAT_JOBS_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"jobs": {str(row): asdict(job) for row, job in sorted(jobs.items())}}
    REPEAT_JOBS_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def repeat_slot_key(job: RepeatJob) -> str:
    """Canonical key for duplicate repeat slot detection."""
    days = ",".join(str(day) for day in sorted(job.days_of_week))
    return f"{job.timezone}|{job.time}|{job.repeat_type}|{days}"


def repeat_jobs_overlap(a: RepeatJob, b: RepeatJob) -> bool:
    if a.timezone != b.timezone or a.time != b.time:
        return False
    if a.repeat_type == "daily" or b.repeat_type == "daily":
        return True
    days_a = set(a.days_of_week)
    days_b = set(b.days_of_week)
    return bool(days_a & days_b)


def local_time_matches_repeat(job: RepeatJob, moment: datetime) -> bool:
    tz = _zoneinfo(job.timezone)
    local = moment.astimezone(tz).replace(second=0, microsecond=0)
    hour, minute = _parse_time(job.time)
    if local.hour != hour or local.minute != minute:
        return False
    if job.repeat_type == "daily":
        return True
    return local.weekday() in job.days_of_week


def compute_next_run(
    job: RepeatJob,
    *,
    after: datetime | None = None,
) -> datetime:
    """Return the next UTC datetime strictly after `after` for this repeat job."""
    validate_repeat_job(job)
    moment = after or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    moment = moment.astimezone(timezone.utc).replace(second=0, microsecond=0)

    tz = _zoneinfo(job.timezone)
    local_now = moment.astimezone(tz)
    hour, minute = _parse_time(job.time)

    for offset in range(0, 366):
        candidate_day = local_now.date() + timedelta(days=offset)
        candidate_local = datetime(
            candidate_day.year,
            candidate_day.month,
            candidate_day.day,
            hour,
            minute,
            tzinfo=tz,
        )
        if candidate_local <= local_now:
            continue
        if job.repeat_type == "weekly" and candidate_local.weekday() not in job.days_of_week:
            continue
        return candidate_local.astimezone(timezone.utc).replace(second=0, microsecond=0)

    raise RuntimeError("Could not compute next repeat run within one year.")


def repeat_job_description(job: RepeatJob) -> str:
    if job.repeat_type == "daily":
        pattern = "daily"
    else:
        labels = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
        days = ", ".join(labels[day] for day in sorted(job.days_of_week))
        pattern = f"weekly ({days})"
    return f"repeat {pattern} at {job.time} {job.timezone}"


def repeat_jobs_to_dict(jobs: dict[int, RepeatJob] | None = None) -> dict[str, Any]:
    loaded = jobs if jobs is not None else load_repeat_jobs()
    return {
        "jobs": {str(row): asdict(job) for row, job in sorted(loaded.items())},
        "known_timezones": list(KNOWN_TIMEZONES),
    }
