"""End-to-end render pipeline for one reserved sheet row."""

import tempfile
import uuid
from pathlib import Path
from typing import Any

from ..config import ENABLE_AUDIO_ENHANCE, TMP_ROOT, logger
from ..gemini_youtube_metadata import generate_youtube_metadata
from ..drive import prepare_background_video
from ..media import download_file, enhance_audio, render_video
from ..models import RenderTaskFailed, RetryJob, SheetRow
from ..row_rules import get_background_loop_count_for_row, get_batch_rule_for_anchor, row_has_thumbnail
from ..sheets import get_sheet_rows, get_sheet_rows_by_numbers, update_task_status
from ..state import current_render, register_retry_job
from ..thumbnails import prepare_row_thumbnail
from ..youtube import (
    finalize_video_privacy,
    resolve_final_privacy,
    set_youtube_thumbnail,
    upload_video_to_youtube,
)
from .batch_audio import build_combined_field, prepare_batch_audio
from .progress import row_progress_callback
from .row_helpers import get_monk_name, get_required
from .upload_log import build_upload_log_message
from .workdir import (
    cleanup_stale_workdirs,
    delete_render_files_after_youtube_upload,
    purge_workdir,
    unlink_if_exists,
)


def process_reserved_row(
    sheets: Any,
    youtube: Any,
    headers: list[str],
    row: SheetRow,
    progress_callback=None,
) -> dict[str, str]:
    batch_context = get_batch_rule_for_anchor(row.row_number)
    is_batch = batch_context is not None
    batch_row_numbers = batch_context[1] if batch_context else [row.row_number]

    _, all_rows = get_sheet_rows(sheets)

    if is_batch:
        batch_sheet_rows = get_sheet_rows_by_numbers(all_rows, batch_row_numbers)
        title = build_combined_field(batch_sheet_rows, "dhamma_title")
        description = build_combined_field(batch_sheet_rows, "description")
        if not title:
            raise RuntimeError(
                f"Missing dhamma_title for batch anchor row {row.row_number}."
            )
    else:
        title = get_required(row, "dhamma_title")
        description = row.values.get("description", "")

    monk_name = get_monk_name(row)
    current_render["title"] = title
    current_render["monk"] = monk_name
    job_progress = row_progress_callback(row, title, monk_name, progress_callback)
    logger.info("Task started: row %s%s", row.row_number, " (batch)" if is_batch else "")
    logger.info("Title: %s", title)

    cleanup_stale_workdirs()
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(prefix=f"render_{row.row_number}_", dir=TMP_ROOT))

    mp3_path = workdir / "audio.mp3"
    enhanced_audio_path = workdir / "audio_enhanced.wav"
    render_audio_path = mp3_path
    background_path = workdir / "background.mp4"
    video_path = workdir / f"{uuid.uuid4().hex}.mp4"
    thumbnail_path: Path | None = None
    cleanup_workdir = True
    uploaded_video_id = None
    thumbnail_warning = ""
    upload_description = description
    upload_tags: list[str] = []

    try:
        if is_batch:
            render_audio_path = prepare_batch_audio(
                all_rows=all_rows,
                batch_row_numbers=batch_row_numbers,
                workdir=workdir,
                job_progress=job_progress,
            )
        else:
            mp3_url = get_required(row, "mp3_url")
            if job_progress is not None:
                job_progress("Downloading MP3", None)
            download_file(mp3_url, mp3_path)
            if job_progress is not None:
                job_progress("Finished MP3 download", None)

            if ENABLE_AUDIO_ENHANCE:
                if job_progress is not None:
                    job_progress("Enhancing audio", 0.0)
                enhance_audio(mp3_path, enhanced_audio_path, job_progress)
                render_audio_path = enhanced_audio_path
                if job_progress is not None:
                    job_progress("Finished audio enhancement", None)
            elif job_progress is not None:
                job_progress("Audio enhancement disabled", None)

        if job_progress is not None:
            job_progress("Preparing background video", None)
        background_source = prepare_background_video(
            background_path, row_number=row.row_number
        )
        logger.info("Background video: %s", background_source)
        if job_progress is not None:
            job_progress("Finished background video", None)

        loop_count = None if is_batch else get_background_loop_count_for_row(row.row_number)
        if loop_count is not None:
            logger.info(
                "Track + background loop count for row %s: %sx",
                row.row_number,
                loop_count,
            )
        elif is_batch:
            logger.info(
                "Batch render for rows %s: auto background loop over combined audio",
                ", ".join(str(number) for number in batch_row_numbers),
            )
        if job_progress is not None:
            job_progress("Rendering video", None)
        render_video(
            render_audio_path,
            background_path,
            video_path,
            job_progress,
            background_loop_count=loop_count,
        )

        thumb_file = workdir / "thumbnail.jpg"
        if job_progress is not None:
            job_progress("Preparing thumbnail", None)
        thumbnail_source = prepare_row_thumbnail(row.row_number, thumb_file)
        if thumbnail_source:
            thumbnail_path = thumb_file
            logger.info("Thumbnail: %s", thumbnail_source)
            if job_progress is not None:
                job_progress("Finished thumbnail", None)
        else:
            logger.info("No row thumbnail configured; skipping.")
            if job_progress is not None:
                job_progress("Thumbnail skipped", None)

        if job_progress is not None:
            job_progress("Generating YouTube metadata", None)
        generated = generate_youtube_metadata(
            monk_name=monk_name,
            dhamma_title=title,
        )
        if generated:
            upload_description = generated.description
            upload_tags = generated.tags
            if job_progress is not None:
                job_progress("Generated YouTube metadata", None)
        else:
            logger.info("Using sheet description (Gemini skipped or unavailable).")

        if job_progress is not None:
            job_progress("Uploading to YouTube", None)
        video_id = upload_video_to_youtube(
            youtube,
            video_path,
            title,
            upload_description,
            job_progress,
            tags=upload_tags,
        )
        uploaded_video_id = video_id
        delete_render_files_after_youtube_upload(
            video_path=video_path,
            background_path=background_path,
            mp3_path=mp3_path,
            enhanced_audio_path=enhanced_audio_path,
            render_audio_path=render_audio_path,
        )

        if thumbnail_path is not None:
            thumbnail_warning = (
                set_youtube_thumbnail(youtube, video_id, thumbnail_path, job_progress)
                or ""
            )

        if job_progress is not None:
            job_progress("Updating Google Sheet", None)
        has_row_thumb = row_has_thumbnail(row.row_number)
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
        rows_to_update = batch_row_numbers if is_batch else [row.row_number]
        for sheet_row_number in rows_to_update:
            update_task_status(
                sheets,
                headers,
                sheet_row_number,
                "uploaded_to_yt",
                log_message,
            )
        logger.info("Upload complete: %s (%s)", video_id, privacy)
        if job_progress is not None:
            job_progress("Finished", None)

        unlink_if_exists(thumbnail_path)
        purge_workdir(workdir)
        cleanup_workdir = False
        return {
            "title": title,
            "monk_name": monk_name,
            "video_id": video_id,
            "url": f"https://studio.youtube.com/video/{video_id}/edit",
            "youtube_url": f"https://youtu.be/{video_id}",
            "thumbnail_warning": thumbnail_warning,
            "row_number": str(row.row_number),
            "batch_rows": ",".join(str(number) for number in batch_row_numbers)
            if is_batch
            else "",
        }
    except Exception as exc:
        logger.error("Task failed: %s", exc)
        try:
            update_task_status(sheets, headers, row.row_number, "failed", str(exc))
        except Exception as status_exc:
            logger.warning("Could not update failed status: %s", status_exc)

        if uploaded_video_id:
            cleanup_workdir = False
        elif video_path.exists():
            cleanup_workdir = False
        retry_id = _register_failure_retry(
            uploaded_video_id=uploaded_video_id,
            video_path=video_path,
            row=row,
            title=title,
            description=upload_description,
            tags=upload_tags,
            thumbnail_warning=thumbnail_warning,
            workdir=workdir,
            thumbnail_path=thumbnail_path,
        )
        raise RenderTaskFailed(str(exc), retry_id) from exc
    finally:
        if cleanup_workdir:
            purge_workdir(workdir)
        else:
            logger.info("Temporary files kept for retry: %s", workdir)


def _register_failure_retry(
    *,
    uploaded_video_id: str | None,
    video_path: Path,
    row: SheetRow,
    title: str,
    description: str,
    tags: list[str] | None = None,
    thumbnail_warning: str,
    workdir: Path,
    thumbnail_path: Path | None,
) -> str:
    if uploaded_video_id:
        return register_retry_job(
            RetryJob(
                mode="sheet_update",
                row=row,
                title=title,
                description=description,
                tags=tags,
                video_id=uploaded_video_id,
                thumbnail_warning=thumbnail_warning or "",
                workdir=workdir,
                thumbnail_path=thumbnail_path,
            )
        )
    if video_path.exists():
        return register_retry_job(
            RetryJob(
                mode="upload",
                row=row,
                title=title,
                description=description,
                tags=tags,
                workdir=workdir,
                video_path=video_path,
                thumbnail_path=thumbnail_path,
            )
        )
    return register_retry_job(
        RetryJob(
            mode="full",
            row=row,
            title=title,
            description=description,
            tags=tags,
        )
    )
