"""Serialize and filter sheet rows for the Jobs API."""

from typing import Any

from ..job_status import (
    JOB_STATUS_FILTER_KEYS,
    is_done_status,
    is_pending_status,
)
from ..jobs.row_helpers import get_duration_min, get_monk_name
from ..repeat_jobs import RepeatJob, load_repeat_jobs, repeat_job_for_row, repeat_jobs_mtime
from ..schedule_time import read_row_schedule_time
from ..sheet_cache import cache_generation, get_cached_sheet_rows

_jobs_memo: tuple[int, float, list[dict]] | None = None


def row_to_job_dict(
    row: Any,
    headers: list[str],
    *,
    repeat_jobs: dict[int, RepeatJob] | None = None,
) -> dict:
    status = row.values.get("status", "").strip().lower()
    title = row.values.get("dhamma_title", row.values.get("title", "")).strip()
    monk = get_monk_name(row)

    logs_col = row.values.get("logs", "")
    youtube_id = ""
    for line in logs_col.splitlines():
        if "video_id=" in line:
            youtube_id = line.split("video_id=")[-1].strip().split()[0]
            break

    schedule_dt = read_row_schedule_time(row.values)
    schedule_time = schedule_dt.isoformat() if schedule_dt else ""

    if repeat_jobs is None:
        repeat_jobs = load_repeat_jobs()
    repeat_job = repeat_jobs.get(row.row_number)
    if repeat_job is None and status == "repeat":
        repeat_job = repeat_job_for_row(
            row.row_number,
            status=status,
            logs=logs_col,
            schedule_time=schedule_time,
        )
    repeat_info = None
    if repeat_job is not None:
        repeat_info = {
            "repeat_type": repeat_job.repeat_type,
            "repeat_time": repeat_job.time,
            "timezone": repeat_job.timezone,
            "days_of_week": repeat_job.days_of_week,
            "thumbnails": [
                {"file_id": thumb.file_id, "name": thumb.name}
                for thumb in repeat_job.thumbnails
            ],
            "background_video_id": repeat_job.background_video_id,
            "background_video_name": repeat_job.background_video_name,
            "background_loop_count": repeat_job.background_loop_count,
            "run_count": repeat_job.run_count,
        }

    return {
        "row": row.row_number,
        "title": title,
        "status": status,
        "monk": monk,
        "logs": logs_col[:300] if logs_col else "",
        "youtube_id": youtube_id,
        "schedule_time": schedule_time,
        "repeat": repeat_info,
        "mp3_url": row.values.get("mp3_url", "").strip(),
        "duration": get_duration_min(row),
    }


def find_sheet_row(row_number: int) -> Any | None:
    _, rows = get_cached_sheet_rows()
    for row in rows:
        if row.row_number == row_number:
            return row
    return None


def _build_jobs_sorted(headers: list[str], rows: list[Any]) -> list[dict]:
    repeat_jobs = load_repeat_jobs()
    jobs = [row_to_job_dict(row, headers, repeat_jobs=repeat_jobs) for row in rows]
    jobs.sort(key=lambda item: item["row"], reverse=True)
    return jobs


def all_jobs_sorted(*, force_refresh: bool = False) -> list[dict]:
    global _jobs_memo
    generation = cache_generation()
    repeat_mtime = repeat_jobs_mtime()

    if (
        not force_refresh
        and _jobs_memo is not None
        and _jobs_memo[0] == generation
        and _jobs_memo[1] == repeat_mtime
    ):
        return _jobs_memo[2]

    headers, rows = get_cached_sheet_rows(force=force_refresh)
    jobs = _build_jobs_sorted(headers, rows)
    _jobs_memo = (generation, repeat_mtime, jobs)
    return jobs


def job_status_counts(jobs: list[dict]) -> dict[str, int]:
    counts = {
        "all": len(jobs),
        "done": sum(1 for job in jobs if is_done_status(job["status"])),
        "processing": sum(1 for job in jobs if job["status"] == "processing"),
        "pending": sum(1 for job in jobs if is_pending_status(job["status"])),
        "do": sum(1 for job in jobs if job["status"] == "do"),
        "scheduled": sum(1 for job in jobs if job["status"] == "scheduled"),
        "repeat": sum(1 for job in jobs if job["status"] == "repeat"),
        "failed": sum(1 for job in jobs if job["status"] == "failed"),
    }
    return {key: counts[key] for key in JOB_STATUS_FILTER_KEYS}


def job_monk_name(job: dict) -> str:
    return (job.get("monk") or job.get("monk_name") or "").strip()


def unique_monk_names(jobs: list[dict]) -> list[str]:
    names: set[str] = set()
    for job in jobs:
        name = job_monk_name(job)
        if name:
            names.add(name)
    return sorted(names)


def filter_jobs(
    jobs: list[dict],
    status: str,
    search: str,
    monk: str = "",
    row: int | None = None,
) -> list[dict]:
    if row is not None:
        jobs = [job for job in jobs if job.get("row") == row]

    query = search.strip().lower()
    monk_filter = monk.strip()
    filtered: list[dict] = []

    for job in jobs:
        job_status = job["status"]
        if status == "done" and not is_done_status(job_status):
            continue
        if status == "processing" and job_status != "processing":
            continue
        if status == "pending" and not is_pending_status(job_status):
            continue
        if status == "do" and job_status != "do":
            continue
        if status == "failed" and job_status != "failed":
            continue
        if status == "scheduled" and job_status != "scheduled":
            continue
        if status == "repeat" and job_status != "repeat":
            continue

        if monk_filter and job_monk_name(job) != monk_filter:
            continue

        if query:
            title = job.get("title", "").lower()
            monk_name = job_monk_name(job).lower()
            row_match = query.isdigit() and str(job.get("row", "")) == query
            if not row_match and query not in title and query not in monk_name:
                continue

        filtered.append(job)

    return filtered


def jobs_in_list_scope(
    jobs: list[dict],
    *,
    search: str = "",
    monk: str = "",
    row: int | None = None,
) -> list[dict]:
    """Jobs matching monk + search before status tab filter (for tab counts)."""
    return filter_jobs(jobs, "all", search, monk, row=row)
