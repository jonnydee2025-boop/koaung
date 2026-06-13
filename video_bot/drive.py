import random
import re
import shutil
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload

from .config import (
    BACKGROUND_VIDEO_DRIVE_FOLDER,
    BACKGROUND_VIDEO_EXTENSIONS,
    DRIVE_BACKGROUND_CACHE_DIR,
    ENABLE_DRIVE_BACKGROUND_CACHE,
    logger,
)
from .google_services import build_drive_service
from .models import DriveBackgroundVideo, DriveMediaFile
from .row_rules import get_rule_for_row

THUMBNAILS_SUBFOLDER_NAME = "Thumbnails"
THUMBNAIL_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
MP4_EXTENSION = ".mp4"


def google_drive_folder_id(value: str) -> str:
    value = value.strip()
    if not value:
        return ""

    parsed = urlparse(value)
    if not parsed.netloc:
        return value

    match = re.search(r"/folders/([^/?#]+)", parsed.path)
    if match:
        return match.group(1)

    folder_id = parse_qs(parsed.query).get("id", [""])[0]
    if folder_id:
        return folder_id

    raise RuntimeError(f"Could not find Google Drive folder ID in: {value}")


def drive_query_literal(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def is_drive_mp4(file: dict[str, str]) -> bool:
    return Path(file.get("name", "")).suffix.lower() == MP4_EXTENSION


def is_drive_thumbnail_image(file: dict[str, str]) -> bool:
    mime_type = file.get("mimeType", "")
    if mime_type.startswith("image/"):
        return True
    return Path(file.get("name", "")).suffix.lower() in THUMBNAIL_IMAGE_EXTENSIONS


def is_drive_background_video(file: dict[str, str]) -> bool:
    mime_type = file.get("mimeType", "")
    if mime_type.startswith("video/"):
        return True

    return Path(file.get("name", "")).suffix.lower() in BACKGROUND_VIDEO_EXTENSIONS


def list_drive_files_in_folder(
    drive: Any,
    folder_id: str,
    *,
    predicate,
) -> list[DriveMediaFile]:
    query = (
        f"'{drive_query_literal(folder_id)}' in parents and "
        "trashed = false and "
        "mimeType != 'application/vnd.google-apps.folder'"
    )
    files: list[DriveMediaFile] = []
    page_token = None

    while True:
        response = (
            drive.files()
            .list(
                q=query,
                spaces="drive",
                fields="nextPageToken, files(id, name, mimeType)",
                pageToken=page_token,
                pageSize=1000,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        files.extend(
            DriveMediaFile(file_id=file["id"], name=file["name"])
            for file in response.get("files", [])
            if predicate(file)
        )
        page_token = response.get("nextPageToken")
        if not page_token:
            return sorted(files, key=lambda item: item.name.lower())


def find_subfolder_id(drive: Any, parent_folder_id: str, folder_name: str) -> str | None:
    query = (
        f"'{drive_query_literal(parent_folder_id)}' in parents and "
        "trashed = false and "
        "mimeType = 'application/vnd.google-apps.folder' and "
        f"name = '{drive_query_literal(folder_name)}'"
    )
    response = (
        drive.files()
        .list(
            q=query,
            spaces="drive",
            fields="files(id, name)",
            pageSize=10,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )
        .execute()
    )
    folders = response.get("files", [])
    if folders:
        return folders[0]["id"]

    # Case-insensitive fallback
    query_loose = (
        f"'{drive_query_literal(parent_folder_id)}' in parents and "
        "trashed = false and "
        "mimeType = 'application/vnd.google-apps.folder'"
    )
    response = (
        drive.files()
        .list(
            q=query_loose,
            spaces="drive",
            fields="files(id, name)",
            pageSize=100,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )
        .execute()
    )
    target = folder_name.strip().lower()
    for folder in response.get("files", []):
        if folder.get("name", "").strip().lower() == target:
            return folder["id"]
    return None


def get_root_drive_folder_id() -> str:
    if not BACKGROUND_VIDEO_DRIVE_FOLDER:
        raise RuntimeError("Set BACKGROUND_VIDEO_DRIVE_FOLDER in .env.")
    return google_drive_folder_id(BACKGROUND_VIDEO_DRIVE_FOLDER)


def list_drive_root_mp4_videos(drive: Any, folder_id: str) -> list[DriveMediaFile]:
    return list_drive_files_in_folder(drive, folder_id, predicate=is_drive_mp4)


def list_drive_thumbnail_images(drive: Any, root_folder_id: str) -> list[DriveMediaFile]:
    thumbnails_folder_id = find_subfolder_id(
        drive, root_folder_id, THUMBNAILS_SUBFOLDER_NAME
    )
    if not thumbnails_folder_id:
        return []
    return list_drive_files_in_folder(
        drive, thumbnails_folder_id, predicate=is_drive_thumbnail_image
    )


def list_drive_background_videos(
    drive: Any,
    folder_id: str,
) -> list[DriveBackgroundVideo]:
    query = (
        f"'{drive_query_literal(folder_id)}' in parents and "
        "trashed = false and "
        "mimeType != 'application/vnd.google-apps.folder'"
    )
    files: list[DriveBackgroundVideo] = []
    page_token = None

    while True:
        response = (
            drive.files()
            .list(
                q=query,
                spaces="drive",
                fields="nextPageToken, files(id, name, mimeType)",
                pageToken=page_token,
                pageSize=1000,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        files.extend(
            DriveBackgroundVideo(file_id=file["id"], name=file["name"])
            for file in response.get("files", [])
            if is_drive_background_video(file)
        )
        page_token = response.get("nextPageToken")
        if not page_token:
            return files


def download_drive_file(drive: Any, file_id: str, destination: Path) -> None:
    request = drive.files().get_media(fileId=file_id, supportsAllDrives=True)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as output:
        downloader = MediaIoBaseDownload(output, request, chunksize=1024 * 1024)
        done = False
        while not done:
            _, done = downloader.next_chunk()


def background_cache_path(file_id: str, file_name: str = "") -> Path:
    ext = Path(file_name).suffix.lower() if file_name else MP4_EXTENSION
    if ext not in BACKGROUND_VIDEO_EXTENSIONS:
        ext = MP4_EXTENSION
    return DRIVE_BACKGROUND_CACHE_DIR / f"{file_id}{ext}"


def _copy_background_to_workdir(cache_path: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(cache_path, destination)


def _download_background_to_cache(drive: Any, file_id: str, cache_path: Path) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    partial_path = cache_path.with_name(f"{cache_path.name}.part")
    try:
        download_drive_file(drive, file_id, partial_path)
        partial_path.replace(cache_path)
    except Exception:
        partial_path.unlink(missing_ok=True)
        raise


def copy_or_download_background_video(
    drive: Any,
    file_id: str,
    destination: Path,
    *,
    file_name: str = "",
    label: str,
) -> str:
    """Use a VPS disk cache keyed by Drive file_id; thumbnails are not cached."""
    if not ENABLE_DRIVE_BACKGROUND_CACHE:
        download_drive_file(drive, file_id, destination)
        return label

    cache_path = background_cache_path(file_id, file_name)
    if cache_path.is_file() and cache_path.stat().st_size > 0:
        _copy_background_to_workdir(cache_path, destination)
        display_name = file_name or file_id
        logger.info(
            "Background video cache hit (%s): %s",
            display_name,
            cache_path,
        )
        return f"{label} (cached)"

    _download_background_to_cache(drive, file_id, cache_path)
    _copy_background_to_workdir(cache_path, destination)
    display_name = file_name or file_id
    logger.info("Background video cached on VPS (%s): %s", display_name, cache_path)
    return label


def is_insufficient_permissions_error(exc: HttpError) -> bool:
    content = exc.content.decode("utf-8", errors="replace")
    return exc.resp.status == 403 and "insufficientPermissions" in content


def pick_and_download_drive_background(
    drive: Any,
    folder_id: str,
    destination: Path,
) -> str:
    candidates = list_drive_background_videos(drive, folder_id)
    if not candidates:
        supported = ", ".join(sorted(BACKGROUND_VIDEO_EXTENSIONS))
        raise RuntimeError(
            f"No background videos found in Google Drive folder {folder_id}. "
            f"Supported types: {supported}"
        )

    selected = random.choice(candidates)
    return copy_or_download_background_video(
        drive,
        selected.file_id,
        destination,
        file_name=selected.name,
        label=f"Google Drive: {selected.name}",
    )


def download_drive_file_by_id(
    drive: Any,
    file_id: str,
    destination: Path,
    *,
    label: str,
    file_name: str = "",
    use_background_cache: bool = False,
) -> str:
    if use_background_cache:
        return copy_or_download_background_video(
            drive,
            file_id,
            destination,
            file_name=file_name,
            label=label,
        )
    download_drive_file(drive, file_id, destination)
    return label


def _with_drive_retry(operation):
    drive = build_drive_service()
    try:
        return operation(drive)
    except HttpError as exc:
        if not is_insufficient_permissions_error(exc):
            raise
        logger.warning("Drive permission missing. Starting Google re-auth.")
        drive = build_drive_service(force_reauth=True)
        return operation(drive)


def prepare_background_video(
    destination: Path,
    row_number: int | None = None,
    *,
    background_video_id: str | None = None,
    background_video_name: str | None = None,
    skip_row_rules: bool = False,
) -> str:
    folder_id = get_root_drive_folder_id()

    def run(drive: Any) -> str:
        explicit_id = (background_video_id or "").strip()
        if explicit_id:
            name = (background_video_name or "").strip() or explicit_id
            return download_drive_file_by_id(
                drive,
                explicit_id,
                destination,
                label=f"Google Drive: {name}",
                file_name=name,
                use_background_cache=True,
            )
        if not skip_row_rules and row_number is not None:
            rule = get_rule_for_row(row_number)
            if rule and rule.background_video_id:
                name = rule.background_video_name or rule.background_video_id
                return download_drive_file_by_id(
                    drive,
                    rule.background_video_id,
                    destination,
                    label=f"Google Drive (row {row_number}): {name}",
                    file_name=name,
                    use_background_cache=True,
                )
        return pick_and_download_drive_background(drive, folder_id, destination)

    return _with_drive_retry(run)


def download_row_thumbnail_image(
    destination: Path,
    row_number: int,
    *,
    file_id: str | None = None,
    file_name: str = "",
) -> str:
    rule = get_rule_for_row(row_number)
    thumb_id = (file_id or (rule.thumbnail_file_id if rule else "")).strip()
    if not thumb_id:
        raise RuntimeError(f"No thumbnail mapping for row {row_number}.")

    def run(drive: Any) -> str:
        name = file_name or (rule.thumbnail_name if rule else "") or thumb_id
        return download_drive_file_by_id(
            drive,
            thumb_id,
            destination,
            label=f"Google Drive thumbnail (row {row_number}): {name}",
        )

    return _with_drive_retry(run)


def fetch_drive_media_catalog() -> dict[str, list[dict[str, str]]]:
    def run(drive: Any) -> dict[str, list[dict[str, str]]]:
        folder_id = get_root_drive_folder_id()
        backgrounds = [
            {"id": item.file_id, "name": item.name}
            for item in list_drive_root_mp4_videos(drive, folder_id)
        ]
        thumbnails = [
            {"id": item.file_id, "name": item.name}
            for item in list_drive_thumbnail_images(drive, folder_id)
        ]
        return {"background_videos": backgrounds, "thumbnail_images": thumbnails}

    return _with_drive_retry(run)

