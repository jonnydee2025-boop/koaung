"""Serialize and filter sheet rows for the Jobs API."""

from typing import Any

from ..schedule_time import read_row_schedule_time
from ..sheet_cache import get_cached_sheet_rows

MONK_NAME_KEYS = ("moke_name", "monk_name", "monk", "speaker", "teacher", "sayadaw")


def row_to_job_dict(row: Any, headers: list[str]) -> dict:
    status = row.values.get("status", "").strip().lower()
    title = row.values.get("dhamma_title", row.values.get("title", "")).strip()
    monk = ""
    for key in MONK_NAME_KEYS:
        value = row.values.get(key, "").strip()
        if value:
            monk = value
            break

    logs_col = row.values.get("logs", "")
    youtube_id = ""
    for line in logs_col.splitlines():
        if "video_id=" in line:
            youtube_id = line.split("video_id=")[-1].strip().split()[0]
            break

    schedule_dt = read_row_schedule_time(row.values)
    schedule_time = schedule_dt.isoformat() if schedule_dt else ""

    return {
        "row": row.row_number,
        "title": title,
        "status": status,
        "monk": monk,
        "logs": logs_col[:300] if logs_col else "",
        "youtube_id": youtube_id,
        "schedule_time": schedule_time,
    }


def all_jobs_sorted(*, force_refresh: bool = False) -> list[dict]:
    headers, rows = get_cached_sheet_rows(force=force_refresh)
    jobs = [row_to_job_dict(row, headers) for row in rows]
    jobs.sort(key=lambda item: item["row"], reverse=True)
    return jobs


def job_status_counts(jobs: list[dict]) -> dict[str, int]:
    def is_done(status: str) -> bool:
        return status in ("uploaded_to_yt", "done")

    def is_pending(status: str) -> bool:
        return status == "pending"

    return {
        "all": len(jobs),
        "done": sum(1 for job in jobs if is_done(job["status"])),
        "processing": sum(1 for job in jobs if job["status"] == "processing"),
        "pending": sum(1 for job in jobs if is_pending(job["status"])),
        "do": sum(1 for job in jobs if job["status"] == "do"),
        "scheduled": sum(1 for job in jobs if job["status"] == "scheduled"),
        "failed": sum(1 for job in jobs if job["status"] == "failed"),
    }


def filter_jobs(jobs: list[dict], status: str, search: str) -> list[dict]:
    query = search.strip().lower()
    filtered: list[dict] = []

    for job in jobs:
        job_status = job["status"]
        if status == "done" and job_status not in ("uploaded_to_yt", "done"):
            continue
        if status == "processing" and job_status != "processing":
            continue
        if status == "pending" and job_status != "pending":
            continue
        if status == "do" and job_status != "do":
            continue
        if status == "failed" and job_status != "failed":
            continue
        if status == "scheduled" and job_status != "scheduled":
            continue

        if query:
            title = job.get("title", "").lower()
            monk = (job.get("monk") or "").lower()
            if query not in title and query not in monk:
                continue

        filtered.append(job)

    return filtered
