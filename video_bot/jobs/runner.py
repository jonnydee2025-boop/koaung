"""Public entry points to run or retry a render job."""

from ..google_services import build_google_services
from ..models import NoPendingRows, RenderTaskFailed, RetryJob
from ..sheets import (
    get_sheet_rows,
    prepare_failed_row_for_retry,
    reserve_next_pending_row,
    update_task_status,
)
from ..row_rules import resolve_batch_anchor_row, row_has_thumbnail
from ..state import current_render, retry_jobs
from ..youtube import (
    finalize_video_privacy,
    resolve_final_privacy,
    set_youtube_thumbnail,
    upload_video_to_youtube,
)
from .progress import row_progress_callback
from .row_helpers import get_monk_name
from .pipeline import process_reserved_row
from .upload_log import build_upload_log_message
from .workdir import purge_workdir, unlink_if_exists
from ..config import logger


def run_render_job(
    progress_callback=None,
    *,
    row_number: int | None = None,
) -> dict[str, str]:
    sheets, youtube = build_google_services()
    if row_number is not None:
        anchor_row = resolve_batch_anchor_row(row_number)
        if anchor_row != row_number:
            logger.info(
                "Batch retry: resolving row %s to anchor row %s",
                row_number,
                anchor_row,
            )
        headers, selected = prepare_failed_row_for_retry(sheets, anchor_row)
    else:
        headers, selected = reserve_next_pending_row(sheets)
        if selected is None:
            raise NoPendingRows()

    logger.info("Selected row: %s", selected.row_number)
    current_render["row_number"] = selected.row_number
    return process_reserved_row(sheets, youtube, headers, selected, progress_callback)


def run_retry_job(retry_id: str, progress_callback=None) -> dict[str, str]:
    job = retry_jobs.get(retry_id)
    if job is None:
        raise RuntimeError("This retry is no longer available. Start a new render.")

    job_progress = row_progress_callback(
        job.row,
        job.title,
        get_monk_name(job.row),
        progress_callback,
    )

    sheets, youtube = build_google_services()
    headers, _ = get_sheet_rows(sheets)
    try:
        update_task_status(sheets, headers, job.row.row_number, "processing", "Retrying task.")
    except Exception as exc:
        logger.warning("Could not update retry processing status: %s", exc)
        raise RenderTaskFailed(str(exc), retry_id) from exc

    if job.mode == "full":
        retry_jobs.pop(retry_id, None)
        return process_reserved_row(sheets, youtube, headers, job.row, progress_callback)

    if job.mode == "sheet_update":
        return _retry_sheet_update(job, retry_id, sheets, youtube, headers, job_progress)

    if job.mode != "upload":
        retry_jobs.pop(retry_id, None)
        raise RuntimeError(f"Unknown retry mode: {job.mode}")

    return _retry_youtube_upload(job, retry_id, sheets, youtube, headers, job_progress)


def _retry_sheet_update(
    job: RetryJob,
    retry_id: str,
    sheets,
    youtube,
    headers,
    job_progress,
) -> dict[str, str]:
    if not job.video_id:
        retry_jobs.pop(retry_id, None)
        raise RuntimeError("Retry video ID is missing.")

    try:
        if job_progress is not None:
            job_progress("Retrying Google Sheet update", None)
        has_row_thumb = row_has_thumbnail(job.row.row_number)
        intended_privacy, private_reason = resolve_final_privacy(
            has_row_thumbnail=has_row_thumb,
            thumbnail_warning=job.thumbnail_warning or None,
        )
        privacy, private_reason = finalize_video_privacy(
            youtube,
            job.video_id,
            intended_privacy,
            private_reason,
            job_progress,
        )
        log_message = build_upload_log_message(
            job.video_id,
            privacy=privacy,
            private_reason=private_reason,
            thumbnail_warning=job.thumbnail_warning,
        )
        update_task_status(
            sheets,
            headers,
            job.row.row_number,
            "uploaded_to_yt",
            log_message,
        )
        retry_jobs.pop(retry_id, None)
        if job.workdir is not None:
            purge_workdir(job.workdir)
        if job_progress is not None:
            job_progress("Finished", None)
        return {
            "title": job.title,
            "monk_name": get_monk_name(job.row),
            "video_id": job.video_id,
            "url": f"https://studio.youtube.com/video/{job.video_id}/edit",
            "youtube_url": f"https://youtu.be/{job.video_id}",
            "thumbnail_warning": job.thumbnail_warning,
            "row_number": str(job.row.row_number),
        }
    except Exception as exc:
        logger.error("Sheet update retry failed: %s", exc)
        raise RenderTaskFailed(str(exc), retry_id) from exc


def _retry_youtube_upload(
    job: RetryJob,
    retry_id: str,
    sheets,
    youtube,
    headers,
    job_progress,
) -> dict[str, str]:
    if job.video_path is None:
        retry_jobs.pop(retry_id, None)
        raise RuntimeError("Retry video file is missing.")

    if not job.video_path.exists():
        retry_jobs.pop(retry_id, None)
        raise RuntimeError(f"Retry video file is missing: {job.video_path}")

    if job.thumbnail_path is not None and not job.thumbnail_path.exists():
        retry_jobs.pop(retry_id, None)
        raise RuntimeError(f"Retry thumbnail file is missing: {job.thumbnail_path}")

    try:
        if job_progress is not None:
            job_progress("Retrying YouTube upload", None)
        video_id = upload_video_to_youtube(
            youtube,
            job.video_path,
            job.title,
            job.description,
            job_progress,
            tags=job.tags or [],
        )
        unlink_if_exists(job.video_path)
        if job.workdir is not None:
            for name in ("background.mp4", "audio.mp3", "audio_enhanced.wav"):
                unlink_if_exists(job.workdir / name)

        thumbnail_warning = ""
        if job.thumbnail_path is not None:
            thumbnail_warning = (
                set_youtube_thumbnail(
                    youtube, video_id, job.thumbnail_path, job_progress
                )
                or ""
            )

        has_row_thumb = row_has_thumbnail(job.row.row_number)
        intended_privacy, private_reason = resolve_final_privacy(
            has_row_thumbnail=has_row_thumb,
            thumbnail_warning=thumbnail_warning or None,
        )
        privacy, private_reason = finalize_video_privacy(
            youtube,
            video_id,
            intended_privacy,
            private_reason,
            job_progress,
        )
        log_message = build_upload_log_message(
            video_id,
            privacy=privacy,
            private_reason=private_reason,
            thumbnail_warning=thumbnail_warning,
        )
        update_task_status(
            sheets,
            headers,
            job.row.row_number,
            "uploaded_to_yt",
            log_message,
        )

        retry_jobs.pop(retry_id, None)
        unlink_if_exists(job.thumbnail_path)
        if job.workdir is not None:
            purge_workdir(job.workdir)

        if job_progress is not None:
            job_progress("Finished", None)
        return {
            "title": job.title,
            "monk_name": get_monk_name(job.row),
            "video_id": video_id,
            "url": f"https://studio.youtube.com/video/{video_id}/edit",
            "youtube_url": f"https://youtu.be/{video_id}",
            "thumbnail_warning": thumbnail_warning,
            "row_number": str(job.row.row_number),
        }
    except Exception as exc:
        logger.error("Retry failed: %s", exc)
        try:
            update_task_status(sheets, headers, job.row.row_number, "failed", str(exc))
        except Exception as status_exc:
            logger.warning("Could not update failed status: %s", status_exc)
        raise RenderTaskFailed(str(exc), retry_id) from exc
