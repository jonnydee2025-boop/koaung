from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..http_errors import http_error_from_value
from ..job_listing import (
    all_jobs_sorted,
    filter_jobs,
    find_sheet_row,
    job_status_counts,
    unique_monk_names,
)
from ..render_runner import queue_admin_render
from ..schemas import ScheduleJobRequest, UpdateJobStatusRequest
from ...sheet_cache import invalidate_sheet_cache
from ...row_rules import resolve_batch_anchor_row
from ...sheets import (
    assert_row_retryable,
    schedule_job_row,
    update_sheet_row_status,
)
from ...media import iter_remote_file

router = APIRouter(tags=["jobs"])


@router.get("/jobs/monks")
def list_job_monks(refresh: bool = Query(default=False)):
    try:
        jobs = all_jobs_sorted(force_refresh=refresh)
        return {"monks": unique_monk_names(jobs)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/jobs")
def list_jobs(
    page: int | None = Query(default=None, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    status: str = Query(default="all"),
    search: str = Query(default=""),
    monk: str = Query(default=""),
    limit: int | None = Query(default=None, ge=1, le=500),
    refresh: bool = Query(default=False),
    full: bool = Query(default=False),
):
    try:
        jobs = all_jobs_sorted(force_refresh=refresh)
        counts = job_status_counts(jobs)

        if full:
            return {
                "jobs": jobs,
                "counts": counts,
                "sheet_total": len(jobs),
            }

        if page is None and limit is not None:
            return filter_jobs(jobs, status, search, monk)[:limit]

        current_page = page or 1
        filtered = filter_jobs(jobs, status, search, monk)
        total = len(filtered)
        start = (current_page - 1) * page_size
        items = filtered[start : start + page_size]
        total_pages = max(1, (total + page_size - 1) // page_size)

        if current_page > total_pages and total > 0:
            current_page = total_pages
            start = (current_page - 1) * page_size
            items = filtered[start : start + page_size]

        return {
            "items": items,
            "page": current_page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "counts": counts,
            "sheet_total": len(jobs),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/jobs/{row_number}/audio")
def stream_job_audio(row_number: int):
    try:
        row = find_sheet_row(row_number)
        if row is None:
            raise HTTPException(status_code=404, detail=f"Row {row_number} not found.")
        mp3_url = row.values.get("mp3_url", "").strip()
        if not mp3_url:
            raise HTTPException(status_code=404, detail=f"Row {row_number} has no mp3_url.")

        return StreamingResponse(
            iter_remote_file(mp3_url),
            media_type="audio/mpeg",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/jobs/{row_number}/schedule")
def schedule_job(row_number: int, body: ScheduleJobRequest):
    try:
        result = schedule_job_row(
            row_number,
            mode=body.mode,
            schedule_time_raw=body.schedule_time,
            repeat_type=body.repeat_type,
            repeat_time=body.repeat_time,
            days_of_week=body.days_of_week,
            timezone=body.timezone,
        )
        invalidate_sheet_cache()
        return result
    except ValueError as exc:
        raise http_error_from_value(exc) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/jobs/{row_number}/retry")
async def retry_job(row_number: int, background_tasks: BackgroundTasks):
    try:
        anchor_row = resolve_batch_anchor_row(row_number)
        assert_row_retryable(anchor_row)
    except ValueError as exc:
        raise http_error_from_value(exc) from exc

    invalidate_sheet_cache()
    result = await queue_admin_render(background_tasks, row_number=anchor_row)
    return {**result, "row": anchor_row, "requested_row": row_number}


@router.post("/jobs/{row_number}/status")
def update_job_status(row_number: int, body: UpdateJobStatusRequest):
    try:
        result = update_sheet_row_status(row_number, body.status)
        invalidate_sheet_cache()
        return result
    except ValueError as exc:
        raise http_error_from_value(exc) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
