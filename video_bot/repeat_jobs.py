"""Per-anchor repeat schedule config (Jobs → Schedule → Repeat)."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .config import REPEAT_JOBS_PATH, logger

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


@dataclass
class RepeatJob:
    anchor_row: int
    repeat_type: RepeatType
    time: str = "07:00"
    days_of_week: list[int] = field(default_factory=list)
    timezone: str = "UTC"


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
    return RepeatJob(
        anchor_row=anchor_row,
        repeat_type=repeat_type,  # type: ignore[arg-type]
        time=str(data.get("time") or "07:00").strip(),
        days_of_week=days,
        timezone=str(data.get("timezone") or "UTC").strip() or "UTC",
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


def get_repeat_job(anchor_row: int) -> RepeatJob | None:
    return load_repeat_jobs().get(anchor_row)


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
