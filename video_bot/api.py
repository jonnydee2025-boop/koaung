"""
FastAPI REST API server for the VideoBot Admin Panel.
Runs alongside the Telegram bot in the same asyncio event loop.
"""
import asyncio
import os
import signal
import threading
import time
from typing import Any

from pydantic import BaseModel, Field

from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .api_auth import verify_admin_api_key
from .config import (
    ADMIN_API_CORS_ORIGINS,
    API_PORT,
    BACKGROUND_VIDEO_DRIVE_FOLDER,
    ROW_RULES_PATH,
    ENABLE_AUDIO_ENHANCE,
    FFMPEG_BIN,
    FFPROBE_BIN,
    SHEET_NAME,
    TMP_ROOT,
    in_memory_log_handler,
    logger,
    missing_media_binaries,
    validate_media_binaries,
)
from .jobs import run_render_job
from .sheet_cache import get_cached_sheet_rows, invalidate_sheet_cache
from .progress_display import apply_progress_to_current_render
from .models import NoPendingRows
from .render_cleanup import cleanup_active_render
from .drive import fetch_drive_media_catalog
from .row_rules import (
    RowRangeRule,
    load_row_rules,
    save_row_rules,
    validate_row_rules,
)
from .schedule_time import read_row_schedule_time
from .sheets import (
    get_sheet_rows,
    get_status_statistics,
    prioritize_sheet_row,
    schedule_sheet_row,
)
from .state import (
    current_render,
    is_render_busy,
    render_cancel_requested,
    render_start_lock,
    reset_current_render_idle,
    task_lock,
)
import video_bot.state as _state

app = FastAPI(title="VideoBot Admin API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ADMIN_API_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api", dependencies=[Depends(verify_admin_api_key)])


# ── helpers ──────────────────────────────────────────────────────────────────

def _row_to_dict(row: Any, headers: list[str]) -> dict:
    """Convert a SheetRow to a JSON-friendly dict."""
    status = row.values.get("status", "").strip().lower()
    title = row.values.get("dhamma_title", row.values.get("title", "")).strip()
    monk = ""
    for key in ("moke_name", "monk_name", "monk", "speaker", "teacher", "sayadaw"):
        v = row.values.get(key, "").strip()
        if v:
            monk = v
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


def _all_jobs_sorted(*, force_refresh: bool = False) -> list[dict]:
    headers, rows = get_cached_sheet_rows(force=force_refresh)
    jobs = [_row_to_dict(r, headers) for r in rows]
    jobs.sort(key=lambda r: r["row"], reverse=True)
    return jobs


def _job_status_counts(jobs: list[dict]) -> dict[str, int]:
    def is_done(status: str) -> bool:
        return status in ("uploaded_to_yt", "done")

    def is_pending(status: str) -> bool:
        return status in ("pending", "do")

    return {
        "all": len(jobs),
        "done": sum(1 for j in jobs if is_done(j["status"])),
        "processing": sum(1 for j in jobs if j["status"] == "processing"),
        "pending": sum(1 for j in jobs if is_pending(j["status"])),
        "scheduled": sum(1 for j in jobs if j["status"] == "scheduled"),
        "failed": sum(1 for j in jobs if j["status"] == "failed"),
    }


def _filter_jobs(jobs: list[dict], status: str, search: str) -> list[dict]:
    query = search.strip().lower()
    filtered: list[dict] = []

    for job in jobs:
        job_status = job["status"]
        if status == "done" and job_status not in ("uploaded_to_yt", "done"):
            continue
        if status == "processing" and job_status != "processing":
            continue
        if status == "pending" and job_status not in ("pending", "do"):
            continue
        if status == "failed" and job_status != "failed":
            continue
        if status == "scheduled" and job_status != "scheduled":
            continue
        if status not in ("all", "done", "processing", "pending", "scheduled", "failed"):
            pass

        if query:
            title = job.get("title", "").lower()
            monk = (job.get("monk") or "").lower()
            if query not in title and query not in monk:
                continue

        filtered.append(job)

    return filtered


async def _run_admin_render() -> None:
    try:
        def progress_cb(status: str, pct: float | None = None) -> None:
            if _state.render_cancel_requested:
                return
            apply_progress_to_current_render(status, pct)

        async with task_lock:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, lambda: run_render_job(progress_cb)
            )

        if _state.render_cancel_requested:
            cleanup_active_render("Cancelled by user")
            return

        current_render.update({
            "running": False,
            "pct": 100,
            "status": "Done",
            "title": result.get("title", ""),
            "youtube_id": result.get("video_id", ""),
        })
        logger.info("Admin panel render complete: %s", result.get("title"))
    except NoPendingRows:
        reset_current_render_idle("No pending rows")
    except Exception as exc:
        if _state.render_cancel_requested:
            cleanup_active_render("Cancelled by user")
            logger.info("Admin panel render cancelled: %s", exc)
        else:
            logger.error("Admin panel render failed: %s", exc)
            reset_current_render_idle(f"Failed: {exc}")
    finally:
        _state.render_cancel_requested = False
        invalidate_sheet_cache()


# ── endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    """Unauthenticated liveness check."""
    return {"ok": True}


@api_router.get("/stats")
def get_stats():
    """Return sheet status counts for the dashboard."""
    try:
        counts = get_status_statistics()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    total = counts.get("total_rows", 0)
    done = counts.get("uploaded_to_yt", 0) + counts.get("done", 0)
    pending = counts.get("pending", 0) + counts.get("do", 0)
    scheduled = counts.get("scheduled", 0)
    processing = counts.get("processing", 0)
    failed = counts.get("failed", 0)
    success_rate = round(done / total * 100, 1) if total else 0.0

    return {
        "total": total,
        "done": done,
        "pending": pending,
        "scheduled": scheduled,
        "processing": processing,
        "failed": failed,
        "success_rate": success_rate,
    }


@api_router.get("/jobs")
def get_jobs(
    page: int | None = Query(default=None, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    status: str = Query(default="all"),
    search: str = Query(default=""),
    limit: int | None = Query(default=None, ge=1, le=500),
    refresh: bool = Query(default=False),
):
    """
    Return sheet jobs. With `limit` only (no `page`), returns a plain array for Dashboard.
    With `page`, returns a paginated payload so the Jobs tab can browse the full sheet.
    """
    try:
        all_jobs = _all_jobs_sorted(force_refresh=refresh)
        counts = _job_status_counts(all_jobs)

        if page is None and limit is not None:
            return _filter_jobs(all_jobs, status, search)[:limit]

        current_page = page or 1
        filtered = _filter_jobs(all_jobs, status, search)
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
            "sheet_total": len(all_jobs),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


class ScheduleJobRequest(BaseModel):
    schedule_time: str = Field(
        ...,
        description="ISO 8601 date/time (e.g. 2026-05-22T14:30:00+00:00)",
    )


@api_router.post("/jobs/{row_number}/schedule")
def schedule_job(row_number: int, body: ScheduleJobRequest):
    """Schedule a row; rejects duplicate Schedule_Time values across the sheet."""
    try:
        result = schedule_sheet_row(row_number, body.schedule_time)
        invalidate_sheet_cache()
        return result
    except ValueError as exc:
        msg = str(exc)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg) from exc
        if "already used" in msg.lower():
            raise HTTPException(status_code=409, detail=msg) from exc
        raise HTTPException(status_code=400, detail=msg) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.post("/jobs/{row_number}/prioritize")
def prioritize_job(row_number: int):
    """Set a sheet row's status to ``do`` so the bot renders it before other pending rows."""
    try:
        previous = prioritize_sheet_row(row_number)
        invalidate_sheet_cache()
        return {
            "row": row_number,
            "status": "do",
            "previous_status": previous,
        }
    except ValueError as exc:
        msg = str(exc)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg) from exc
        raise HTTPException(status_code=409, detail=msg) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.get("/logs")
def get_logs(n: int = 120):
    """Return the last N in-memory log lines."""
    lines = list(in_memory_log_handler.buffer)[-n:]
    return [{"time": l["time"], "level": l["level"], "msg": l["msg"]} for l in lines]


@api_router.get("/render-status")
def get_render_status():
    """Return the current render job progress."""
    return dict(current_render)


@api_router.post("/render-next")
async def trigger_render_next(background_tasks: BackgroundTasks):
    """Kick off the next pending render job as a background task."""
    async with render_start_lock:
        if is_render_busy():
            raise HTTPException(
                status_code=409,
                detail="A render job is already running.",
            )
        try:
            validate_media_binaries()
        except FileNotFoundError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        current_render.update({
            "running": True,
            "pct": 0,
            "status": "Queued",
            "title": "",
            "youtube_id": "",
            "row_number": 0,
        })
        background_tasks.add_task(_run_admin_render)

    return {"queued": True}


@api_router.post("/render-cancel")
def cancel_render():
    """Forcefully stop the currently running FFmpeg process."""
    if not is_render_busy():
        return {"cancelled": False, "reason": "No render is running"}

    try:
        cleaned = cleanup_active_render("Cancelled by user")
    except Exception as exc:
        logger.error("Render cancel cleanup failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"cancelled": cleaned}


@api_router.post("/server/shutdown")
def shutdown_server():
    """Completely shut down the Python backend process."""
    logger.warning("Admin panel requested FULL SERVER SHUTDOWN.")
    cleanup_active_render("Server shut down — render interrupted")

    def kill_soon() -> None:
        time.sleep(1)
        if os.name == "nt":
            if hasattr(signal, "CTRL_C_EVENT"):
                os.kill(os.getpid(), signal.CTRL_C_EVENT)
            else:
                os.kill(os.getpid(), signal.SIGTERM)
        else:
            os.kill(os.getpid(), signal.SIGTERM)

    threading.Thread(target=kill_soon, daemon=True).start()
    return {"shutting_down": True}


class RowRangeRulePayload(BaseModel):
    from_row: int = Field(..., ge=1)
    to_row: int | None = Field(default=None, ge=1)
    background_video_id: str = ""
    background_video_name: str = ""
    thumbnail_file_id: str = ""
    thumbnail_name: str = ""


class RowRulesUpdateRequest(BaseModel):
    rules: list[RowRangeRulePayload]


@api_router.get("/settings")
def get_settings():
    """Return non-secret config values."""
    missing_binaries = missing_media_binaries()
    return {
        "sheet_name": SHEET_NAME,
        "tmp_root": str(TMP_ROOT),
        "ffmpeg_bin": FFMPEG_BIN,
        "ffprobe_bin": FFPROBE_BIN,
        "media_binaries_ok": not missing_binaries,
        "missing_media_binaries": missing_binaries,
        "background_video_folder": BACKGROUND_VIDEO_DRIVE_FOLDER,
        "enable_audio_enhance": ENABLE_AUDIO_ENHANCE,
        "api_port": API_PORT,
        "row_rules_path": str(ROW_RULES_PATH),
    }


@api_router.get("/settings/row-rules")
def get_row_rules():
    rules = load_row_rules()
    return {
        "rules": [
            {
                "from_row": rule.from_row,
                "to_row": rule.to_row,
                "background_video_id": rule.background_video_id,
                "background_video_name": rule.background_video_name,
                "thumbnail_file_id": rule.thumbnail_file_id,
                "thumbnail_name": rule.thumbnail_name,
            }
            for rule in rules
        ]
    }


@api_router.put("/settings/row-rules")
def put_row_rules(body: RowRulesUpdateRequest):
    try:
        rules = [
            RowRangeRule(
                from_row=item.from_row,
                to_row=item.to_row,
                background_video_id=item.background_video_id.strip(),
                background_video_name=item.background_video_name.strip(),
                thumbnail_file_id=item.thumbnail_file_id.strip(),
                thumbnail_name=item.thumbnail_name.strip(),
            )
            for item in body.rules
        ]
        validate_row_rules(rules)
        save_row_rules(rules)
        return {"saved": True, "count": len(rules)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.get("/drive/media-options")
def get_drive_media_options():
    """List .mp4 files in Drive root and images in Thumbnails/ subfolder."""
    try:
        return fetch_drive_media_catalog()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.get("/bot/status")
def get_bot_status():
    """Return whether Telegram polling is currently active."""
    app_ref = _state.telegram_app
    if app_ref is None:
        return {"online": False, "reason": "Not initialized"}
    updater = getattr(app_ref, "updater", None)
    running = getattr(updater, "running", False) if updater else False
    return {"online": running}


@api_router.post("/bot/stop")
async def stop_bot():
    """Stop Telegram polling (API server keeps running)."""
    app_ref = _state.telegram_app
    if app_ref is None:
        raise HTTPException(status_code=503, detail="Bot not initialized.")
    updater = getattr(app_ref, "updater", None)
    if updater is None:
        raise HTTPException(status_code=503, detail="No updater found.")
    if not updater.running:
        return {"stopped": False, "reason": "Already stopped"}
    render_stopped = cleanup_active_render("Bot stopped — render interrupted")
    await updater.stop()
    logger.info("Admin panel: Telegram polling stopped.")
    return {"stopped": True, "render_interrupted": render_stopped}


@api_router.post("/bot/start")
async def start_bot():
    """Resume Telegram polling."""
    app_ref = _state.telegram_app
    if app_ref is None:
        raise HTTPException(status_code=503, detail="Bot not initialized.")
    updater = getattr(app_ref, "updater", None)
    if updater is None:
        raise HTTPException(status_code=503, detail="No updater found.")
    if updater.running:
        return {"started": False, "reason": "Already running"}
    from telegram import Update

    await updater.start_polling(allowed_updates=Update.ALL_TYPES)
    logger.info("Admin panel: Telegram polling started.")
    return {"started": True}


app.include_router(api_router)
