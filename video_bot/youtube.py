import time
from pathlib import Path
from typing import Any, Literal

from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

from .config import logger
from .state import ProgressCallback

PrivacyStatus = Literal["public", "private", "unlisted"]

YOUTUBE_UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024


def resolve_final_privacy(
    *,
    has_row_thumbnail: bool,
    thumbnail_warning: str | None,
) -> tuple[PrivacyStatus, str | None]:
    if not has_row_thumbnail:
        return "private", "no thumbnail in row rules"
    if thumbnail_warning:
        return "private", f"thumbnail failed: {thumbnail_warning}"
    return "public", None


def set_video_privacy(
    youtube: Any,
    video_id: str,
    privacy_status: PrivacyStatus,
    progress_callback: ProgressCallback | None = None,
) -> None:
    if progress_callback is not None:
        progress_callback(f"Setting YouTube visibility to {privacy_status}", None)
    youtube.videos().update(
        part="status",
        body={
            "id": video_id,
            "status": {
                "privacyStatus": privacy_status,
                "selfDeclaredMadeForKids": False,
            },
        },
    ).execute()
    if progress_callback is not None:
        progress_callback(f"YouTube visibility set to {privacy_status}", None)

def upload_video_to_youtube(
    youtube: Any,
    video_path: Path,
    title: str,
    description: str,
    progress_callback: ProgressCallback | None = None,
    *,
    privacy_status: PrivacyStatus = "private",
) -> str:
    request_body = {
        "snippet": {
            "title": title[:100],
            "description": description,
            "categoryId": "27",
        },
        "status": {
            "privacyStatus": privacy_status,
            "selfDeclaredMadeForKids": False,
        },
    }

    media = MediaFileUpload(
        str(video_path),
        chunksize=YOUTUBE_UPLOAD_CHUNK_SIZE,
        resumable=True,
    )
    request = youtube.videos().insert(
        part="snippet,status",
        body=request_body,
        media_body=media,
    )

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status is not None and progress_callback is not None:
            progress_callback("Uploading video to YouTube", status.progress() * 100)

    video_id = response["id"]
    if progress_callback is not None:
        progress_callback("Finished video upload", None)
    return video_id


def set_youtube_thumbnail(
    youtube: Any,
    video_id: str,
    thumbnail_path: Path,
    progress_callback: ProgressCallback | None = None,
) -> str | None:
    if progress_callback is not None:
        progress_callback("Uploading thumbnail", None)

    retry_delays_seconds = (0, 5, 15, 30, 60)
    last_error: HttpError | None = None

    for attempt, delay in enumerate(retry_delays_seconds):
        if delay:
            if progress_callback is not None:
                progress_callback(
                    f"Waiting for YouTube ({delay}s) before thumbnail retry",
                    None,
                )
            time.sleep(delay)

        try:
            youtube.thumbnails().set(
                videoId=video_id,
                media_body=MediaFileUpload(str(thumbnail_path), mimetype="image/jpeg"),
            ).execute()
            if progress_callback is not None:
                progress_callback("Finished thumbnail upload", None)
            return None
        except HttpError as exc:
            last_error = exc
            status = getattr(exc.resp, "status", None)
            if status == 403:
                break
            if attempt == len(retry_delays_seconds) - 1:
                break
            logger.warning(
                "Thumbnail upload attempt %s failed for video %s: %s",
                attempt + 1,
                video_id,
                exc,
            )

    exc = last_error
    if exc is None:
        return "Custom thumbnail skipped: unknown error."

    thumbnail_warning = (
        "Custom thumbnail skipped. YouTube says this account does not have "
        "permission to set custom video thumbnails."
        if getattr(exc.resp, "status", None) == 403
        else f"Custom thumbnail skipped: {exc}"
    )
    logger.warning("Thumbnail upload skipped for video %s: %s", video_id, exc)
    if progress_callback is not None:
        progress_callback("Skipped thumbnail upload", None)

    return thumbnail_warning
