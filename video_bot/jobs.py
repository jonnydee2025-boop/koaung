import html
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

from .config import ENABLE_AUDIO_ENHANCE, TMP_ROOT, logger
from .drive import prepare_background_video
from .google_services import build_google_services
from .media import download_file, enhance_audio, render_video
from .models import NoPendingRows, PendingThumbnailJob, RenderTaskFailed, RetryJob, SheetRow
from .sheets import (
    get_sheet_rows,
    prepare_failed_row_for_retry,
    reserve_next_pending_row,
    update_task_status,
)
from .state import (
    PROGRESS_HTML_PREFIX,
    ProgressCallback,
    current_render,
    pending_thumbnail_by_chat,
    pending_thumbnail_jobs,
    register_retry_job,
    retry_jobs,
)
from .thumbnails import generate_thumbnail_for_row
from .youtube import set_youtube_thumbnail, upload_video_to_youtube


def get_required(row: SheetRow, key: str) -> str:
    value = row.values.get(key, "").strip()
    if not value:
        raise RuntimeError(f"Missing required '{key}' value in row {row.row_number}.")
    return value


def get_monk_name(row: SheetRow) -> str:
    for key in ("moke_name", "monk_name", "monk", "speaker", "teacher", "sayadaw"):
        value = row.values.get(key, "").strip()
        if value:
            return value
    return ""


def get_duration_min(row: SheetRow) -> str:
    for key in ("duration_min", "duration_minutes", "duration", "length_min", "length"):
        value = row.values.get(key, "").strip()
        if value:
            return value
    return "-"


def progress_bar(percent: float) -> str:
    bounded = max(0.0, min(100.0, percent))
    filled = int(round(bounded / 10))
    return f"[{'#' * filled}{'.' * (10 - filled)}] {bounded:5.1f}%"


def format_job_progress_html(
    title: str,
    monk_name: str,
    duration_min: str,
    status: str,
    percent: float | None,
) -> str:
    progress = progress_bar(percent) if percent is not None else "loading..."
    return (
        f"{PROGRESS_HTML_PREFIX}"
        "<b>WORKING</b>\n"
        f"Title : <code>{html.escape(title or '-')}</code>\n"
        f"Monk : <code>{html.escape(monk_name or '-')}</code>\n"
        f"Duration : <code>{html.escape(duration_min or '-')}</code>\n"
        f"Status : <code>{html.escape(status)}</code>\n"
        f"Progress : <code>{html.escape(progress)}</code>"
    )


def row_progress_callback(
    row: SheetRow,
    title: str,
    monk_name: str,
    progress_callback: ProgressCallback | None,
) -> ProgressCallback | None:
    if progress_callback is None:
        return None

    duration_min = get_duration_min(row)

    def callback(status: str, percent: float | None = None) -> None:
        progress_callback(
            format_job_progress_html(title, monk_name, duration_min, status, percent),
            percent,
        )

    return callback


def register_pending_thumbnail(chat_id: int, result: dict[str, str]) -> dict[str, str]:
    auto_thumbnail_path = result.get("auto_thumbnail_path")
    workdir = result.get("thumbnail_workdir")
    if not auto_thumbnail_path or not workdir:
        return result

    old_thumbnail_id = pending_thumbnail_by_chat.get(chat_id)
    if old_thumbnail_id:
        old_job = remove_pending_thumbnail(old_thumbnail_id)
        if old_job is not None:
            shutil.rmtree(old_job.workdir, ignore_errors=True)

    thumbnail_id = uuid.uuid4().hex[:16]
    pending_thumbnail_jobs[thumbnail_id] = PendingThumbnailJob(
        video_id=result["video_id"],
        title=result["title"],
        row_number=int(result.get("row_number") or 0),
        auto_thumbnail_path=Path(auto_thumbnail_path),
        workdir=Path(workdir),
        monk_name=result.get("monk_name", ""),
    )
    pending_thumbnail_by_chat[chat_id] = thumbnail_id
    result["thumbnail_id"] = thumbnail_id
    return result


def remove_pending_thumbnail(thumbnail_id: str) -> PendingThumbnailJob | None:
    job = pending_thumbnail_jobs.pop(thumbnail_id, None)
    for chat_id, stored_id in list(pending_thumbnail_by_chat.items()):
        if stored_id == thumbnail_id:
            pending_thumbnail_by_chat.pop(chat_id, None)
    return job


def apply_pending_thumbnail(
    thumbnail_id: str,
    thumbnail_path: Path,
    source_label: str,
) -> dict[str, str]:
    job = pending_thumbnail_jobs.get(thumbnail_id)
    if job is None:
        raise RuntimeError("This thumbnail request is no longer available.")

    sheets, youtube = build_google_services()
    warning = set_youtube_thumbnail(youtube, job.video_id, thumbnail_path)

    headers, _ = get_sheet_rows(sheets)
    if warning:
        log_message = (
            f"Uploaded privately to YouTube. video_id={job.video_id}\n"
            f"{source_label} thumbnail failed: {warning}"
        )
    else:
        log_message = (
            f"Uploaded privately to YouTube. video_id={job.video_id}\n"
            f"Thumbnail updated from {source_label}."
        )

    if job.row_number:
        update_task_status(
            sheets,
            headers,
            job.row_number,
            "uploaded_to_yt",
            log_message,
        )

    remove_pending_thumbnail(thumbnail_id)
    shutil.rmtree(job.workdir, ignore_errors=True)

    return {
        "title": job.title,
        "monk_name": job.monk_name,
        "video_id": job.video_id,
        "url": f"https://studio.youtube.com/video/{job.video_id}/edit",
        "youtube_url": f"https://youtu.be/{job.video_id}",
        "thumbnail_warning": warning or "",
    }


def skip_pending_thumbnail(thumbnail_id: str) -> None:
    job = pending_thumbnail_jobs.get(thumbnail_id)
    if job is None:
        return

    try:
        sheets, _ = build_google_services()
        headers, _ = get_sheet_rows(sheets)
        if job.row_number:
            update_task_status(
                sheets,
                headers,
                job.row_number,
                "uploaded_to_yt",
                f"Uploaded privately to YouTube. video_id={job.video_id}\n"
                "Thumbnail skipped.",
            )
    finally:
        remove_pending_thumbnail(thumbnail_id)
        shutil.rmtree(job.workdir, ignore_errors=True)


def cleanup_success_artifacts(result: dict[str, str]) -> None:
    workdir = result.get("thumbnail_workdir")
    if workdir:
        shutil.rmtree(workdir, ignore_errors=True)


def process_reserved_row(
    sheets: Any,
    youtube: Any,
    headers: list[str],
    row: SheetRow,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, str]:
    title = get_required(row, "dhamma_title")
    monk_name = get_monk_name(row)
    job_progress = row_progress_callback(row, title, monk_name, progress_callback)
    mp3_url = get_required(row, "mp3_url")
    description = row.values.get("description", "")
    logger.info("Task started: row %s", row.row_number)
    logger.info("Title: %s", title)

    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(prefix=f"render_{row.row_number}_", dir=TMP_ROOT))

    mp3_path = workdir / "audio.mp3"
    enhanced_audio_path = workdir / "audio_enhanced.wav"
    render_audio_path = mp3_path
    background_path = workdir / "background.mp4"
    video_path = workdir / f"{uuid.uuid4().hex}.mp4"
    thumbnail_path = workdir / f"{uuid.uuid4().hex}.jpg"
    cleanup_workdir = True
    uploaded_video_id = None
    thumbnail_warning = ""

    try:
        logger.info("Downloading MP3...")
        if job_progress is not None:
            job_progress("Downloading MP3", None)
        download_file(mp3_url, mp3_path)
        if job_progress is not None:
            job_progress("Finished MP3 download", None)
        if ENABLE_AUDIO_ENHANCE:
            logger.info("Enhancing audio...")
            if job_progress is not None:
                job_progress("Enhancing audio", 0.0)
            enhance_audio(mp3_path, enhanced_audio_path, job_progress)
            render_audio_path = enhanced_audio_path
            if job_progress is not None:
                job_progress("Finished audio enhancement", None)
        else:
            logger.info("Audio enhancement disabled.")
            if job_progress is not None:
                job_progress("Audio enhancement disabled", None)
        logger.info("Preparing background video...")
        if job_progress is not None:
            job_progress("Preparing background video", None)
        background_source = prepare_background_video(
            background_path, row_number=row.row_number
        )
        logger.info("Background video: %s", background_source)
        if job_progress is not None:
            job_progress("Finished background video", None)
        logger.info("Rendering video. This may take a while...")
        render_video(render_audio_path, background_path, video_path, job_progress)
        logger.info("Creating thumbnail...")
        if job_progress is not None:
            job_progress("Creating thumbnail", None)
        thumbnail_source = generate_thumbnail_for_row(
            row.row_number, title, thumbnail_path
        )
        logger.info("Thumbnail: %s", thumbnail_source)
        if job_progress is not None:
            job_progress("Finished thumbnail", None)
        logger.info("Uploading to YouTube as private...")
        if job_progress is not None:
            job_progress("Uploading to YouTube", None)
        video_id = upload_video_to_youtube(
            youtube,
            video_path,
            title,
            description,
            job_progress,
        )
        uploaded_video_id = video_id

        if job_progress is not None:
            job_progress("Updating Google Sheet", None)
        log_message = (
            f"Uploaded privately to YouTube. video_id={video_id}\n"
            "Telegram chat cleaned after upload."
        )

        update_task_status(
            sheets,
            headers,
            row.row_number,
            "uploaded_to_yt",
            log_message,
        )
        logger.info("Upload complete: %s", video_id)
        if job_progress is not None:
            job_progress("Finished", None)
        cleanup_workdir = False
        return {
            "title": title,
            "monk_name": monk_name,
            "video_id": video_id,
            "url": f"https://studio.youtube.com/video/{video_id}/edit",
            "youtube_url": f"https://youtu.be/{video_id}",
            "thumbnail_warning": "",
            "auto_thumbnail_path": str(thumbnail_path),
            "thumbnail_workdir": str(workdir),
            "row_number": str(row.row_number),
        }
    except Exception as exc:
        logger.error("Task failed: %s", exc)
        try:
            update_task_status(sheets, headers, row.row_number, "failed", str(exc))
        except Exception as status_exc:
            logger.warning("Could not update failed status: %s", status_exc)
        if uploaded_video_id:
            cleanup_workdir = False
            retry_id = register_retry_job(
                RetryJob(
                    mode="sheet_update",
                    row=row,
                    title=title,
                    description=description,
                    video_id=uploaded_video_id,
                    thumbnail_warning=thumbnail_warning or "",
                    workdir=workdir,
                    thumbnail_path=thumbnail_path,
                )
            )
        elif video_path.exists() and thumbnail_path.exists():
            cleanup_workdir = False
            retry_id = register_retry_job(
                RetryJob(
                    mode="upload",
                    row=row,
                    title=title,
                    description=description,
                    workdir=workdir,
                    video_path=video_path,
                    thumbnail_path=thumbnail_path,
                )
            )
        else:
            retry_id = register_retry_job(
                RetryJob(
                    mode="full",
                    row=row,
                    title=title,
                    description=description,
                )
            )
        raise RenderTaskFailed(str(exc), retry_id) from exc
    finally:
        if cleanup_workdir:
            shutil.rmtree(workdir, ignore_errors=True)
            logger.info("Temporary files cleaned.")
        else:
            logger.info("Temporary files kept for retry: %s", workdir)


def run_render_job(
    progress_callback: ProgressCallback | None = None,
    *,
    row_number: int | None = None,
) -> dict[str, str]:
    sheets, youtube = build_google_services()
    if row_number is not None:
        headers, selected = prepare_failed_row_for_retry(sheets, row_number)
    else:
        headers, selected = reserve_next_pending_row(sheets)
        if selected is None:
            raise NoPendingRows()

    logger.info("Selected row: %s", selected.row_number)
    current_render["row_number"] = selected.row_number
    return process_reserved_row(sheets, youtube, headers, selected, progress_callback)


def run_retry_job(
    retry_id: str,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, str]:
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
        if not job.video_id:
            retry_jobs.pop(retry_id, None)
            raise RuntimeError("Retry video ID is missing.")

        try:
            if job_progress is not None:
                job_progress("Retrying Google Sheet update", None)
            log_message = f"Uploaded privately to YouTube. video_id={job.video_id}"
            if job.thumbnail_warning:
                log_message = f"{log_message}\n{job.thumbnail_warning}"
            update_task_status(
                sheets,
                headers,
                job.row.row_number,
                "uploaded_to_yt",
                log_message,
            )
            retry_jobs.pop(retry_id, None)
            if job_progress is not None:
                job_progress("Finished", None)
            return {
                "title": job.title,
                "monk_name": get_monk_name(job.row),
                "video_id": job.video_id,
                "url": f"https://studio.youtube.com/video/{job.video_id}/edit",
                "youtube_url": f"https://youtu.be/{job.video_id}",
                "thumbnail_warning": job.thumbnail_warning,
                "auto_thumbnail_path": str(job.thumbnail_path) if job.thumbnail_path else "",
                "thumbnail_workdir": str(job.workdir) if job.workdir else "",
                "row_number": str(job.row.row_number),
            }
        except Exception as exc:
            logger.error("Sheet update retry failed: %s", exc)
            raise RenderTaskFailed(str(exc), retry_id) from exc

    if job.mode != "upload":
        retry_jobs.pop(retry_id, None)
        raise RuntimeError(f"Unknown retry mode: {job.mode}")

    if job.video_path is None or job.thumbnail_path is None:
        retry_jobs.pop(retry_id, None)
        raise RuntimeError("Retry files are missing.")

    if not job.video_path.exists():
        retry_jobs.pop(retry_id, None)
        raise RuntimeError(f"Retry video file is missing: {job.video_path}")

    if not job.thumbnail_path.exists():
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
        )

        log_message = (
            f"Uploaded privately to YouTube. video_id={video_id}\n"
            "Telegram chat cleaned after upload."
        )
        update_task_status(
            sheets,
            headers,
            job.row.row_number,
            "uploaded_to_yt",
            log_message,
        )

        retry_jobs.pop(retry_id, None)

        if job_progress is not None:
            job_progress("Finished", None)
        return {
            "title": job.title,
            "monk_name": get_monk_name(job.row),
            "video_id": video_id,
            "url": f"https://studio.youtube.com/video/{video_id}/edit",
            "youtube_url": f"https://youtu.be/{video_id}",
            "thumbnail_warning": "",
            "auto_thumbnail_path": str(job.thumbnail_path),
            "thumbnail_workdir": str(job.workdir) if job.workdir is not None else "",
            "row_number": str(job.row.row_number),
        }
    except Exception as exc:
        logger.error("Retry failed: %s", exc)
        try:
            update_task_status(sheets, headers, job.row.row_number, "failed", str(exc))
        except Exception as status_exc:
            logger.warning("Could not update failed status: %s", status_exc)
        raise RenderTaskFailed(str(exc), retry_id) from exc
