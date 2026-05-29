"""Build calendar events for scheduled, repeat, and priority (do) jobs."""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta, timezone
from typing import Any

from ..repeat_jobs import compute_next_run, get_repeat_job
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
    job,
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


def build_calendar_events(year: int, month: int) -> list[dict[str, Any]]:
    month_start, month_end = month_range(year, month)
    events: list[dict[str, Any]] = []
    today = datetime.now(timezone.utc).date()
    today_in_month = month_start.date() <= today <= month_end.date()

    for job in all_jobs_sorted():
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
            continue

        if status == "repeat" and row is not None:
            repeat_job = get_repeat_job(int(row))
            if repeat_job is None:
                continue
            for at in _expand_repeat_occurrences(repeat_job, month_start, month_end):
                events.append(
                    {
                        "at": at.isoformat(),
                        "kind": "repeat",
                        "row": row,
                        "title": title,
                        "monk": monk,
                        "status": status,
                    }
                )

    events.sort(key=lambda item: item["at"])
    return events
