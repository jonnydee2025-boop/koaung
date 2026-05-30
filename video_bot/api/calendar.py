"""Build calendar events for scheduled, repeat, and priority (do) jobs."""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta, timezone
from typing import Any

from ..config import logger
from ..repeat_jobs import RepeatJob, compute_next_run, load_repeat_jobs
from .job_listing import all_jobs_sorted


def month_range(year: int, month: int) -> tuple[datetime, datetime]:
    month_start = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    last_day = calendar.monthrange(year, month)[1]
    month_end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
    return month_start, month_end


def _parse_schedule_time(raw: str) -> datetime | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _expand_repeat_occurrences(
    job: RepeatJob,
    start: datetime,
    end: datetime,
    *,
    max_iterations: int = 400,
) -> list[datetime]:
    occurrences: list[datetime] = []
    cursor = start - timedelta(seconds=1)
    for _ in range(max_iterations):
        next_run = compute_next_run(job, after=cursor)
        if next_run > end:
            break
        if next_run >= start:
            occurrences.append(next_run)
        cursor = next_run
    return occurrences


def _job_meta(jobs_by_row: dict[int, dict[str, Any]], row: int) -> tuple[str, str]:
    job = jobs_by_row.get(row, {})
    title = (job.get("title") or "").strip() or f"Row {row}"
    monk = (job.get("monk") or "").strip()
    return title, monk


def _append_repeat_events(
    events: list[dict[str, Any]],
    repeat_job: RepeatJob,
    *,
    row: int,
    title: str,
    monk: str,
    month_start: datetime,
    month_end: datetime,
) -> None:
    for at in _expand_repeat_occurrences(repeat_job, month_start, month_end):
        events.append(
            {
                "at": at.isoformat(),
                "kind": "repeat",
                "row": row,
                "title": title,
                "monk": monk,
                "status": "repeat",
            }
        )


def build_calendar_events(year: int, month: int) -> list[dict[str, Any]]:
    month_start, month_end = month_range(year, month)
    events: list[dict[str, Any]] = []
    today = datetime.now(timezone.utc).date()
    today_in_month = month_start.date() <= today <= month_end.date()

    jobs = all_jobs_sorted()
    jobs_by_row = {
        int(job["row"]): job
        for job in jobs
        if job.get("row") is not None
    }

    for job in jobs:
        status = (job.get("status") or "").strip().lower()
        title = (job.get("title") or "").strip() or f"Row {job.get('row')}"
        monk = (job.get("monk") or "").strip()
        row = job.get("row")

        if status == "do":
            if today_in_month:
                stagger_minutes = int(row) if row is not None else 0
                display_at = datetime(
                    today.year,
                    today.month,
                    today.day,
                    12,
                    0,
                    0,
                    tzinfo=timezone.utc,
                ) + timedelta(minutes=stagger_minutes)
                events.append(
                    {
                        "at": display_at.isoformat(),
                        "kind": "do",
                        "row": row,
                        "title": title,
                        "monk": monk,
                        "status": status,
                    }
                )
            continue

        if status == "scheduled":
            schedule_dt = _parse_schedule_time(job.get("schedule_time", ""))
            if schedule_dt is not None and month_start <= schedule_dt <= month_end:
                events.append(
                    {
                        "at": schedule_dt.isoformat(),
                        "kind": "scheduled",
                        "row": row,
                        "title": title,
                        "monk": monk,
                        "status": status,
                    }
                )

    # Repeat schedules come from repeat_jobs.json (same source as the scheduler).
    covered_anchors: set[int] = set()
    for anchor_row, repeat_job in load_repeat_jobs().items():
        covered_anchors.add(anchor_row)
        title, monk = _job_meta(jobs_by_row, anchor_row)
        _append_repeat_events(
            events,
            repeat_job,
            row=anchor_row,
            title=title,
            monk=monk,
            month_start=month_start,
            month_end=month_end,
        )

    # Fallback when the sheet says repeat but repeat_jobs.json is missing that anchor.
    for row, job in jobs_by_row.items():
        if row in covered_anchors:
            continue
        status = (job.get("status") or "").strip().lower()
        if status != "repeat":
            continue
        schedule_dt = _parse_schedule_time(job.get("schedule_time", ""))
        if schedule_dt is None or not (month_start <= schedule_dt <= month_end):
            logger.warning(
                "Calendar: row %s is repeat but has no repeat_jobs.json entry "
                "and no Schedule_Time in this month",
                row,
            )
            continue
        title, monk = _job_meta(jobs_by_row, row)
        events.append(
            {
                "at": schedule_dt.isoformat(),
                "kind": "repeat",
                "row": row,
                "title": title,
                "monk": monk,
                "status": "repeat",
            }
        )

    events.sort(key=lambda item: item["at"])
    return events
