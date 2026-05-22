import random
import re
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload

from .config import BACKGROUND_VIDEO_DRIVE_FOLDER, BACKGROUND_VIDEO_EXTENSIONS, logger
from .google_services import build_drive_service
from .models import DriveBackgroundVideo


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


def is_drive_background_video(file: dict[str, str]) -> bool:
    mime_type = file.get("mimeType", "")
    if mime_type.startswith("video/"):
        return True

    return Path(file.get("name", "")).suffix.lower() in BACKGROUND_VIDEO_EXTENSIONS


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
    with destination.open("wb") as output:
        downloader = MediaIoBaseDownload(output, request, chunksize=1024 * 1024)
        done = False
        while not done:
            _, done = downloader.next_chunk()


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
    download_drive_file(drive, selected.file_id, destination)
    return f"Google Drive: {selected.name}"


def prepare_background_video(destination: Path) -> str:
    if not BACKGROUND_VIDEO_DRIVE_FOLDER:
        raise RuntimeError("Set BACKGROUND_VIDEO_DRIVE_FOLDER in .env.")

    folder_id = google_drive_folder_id(BACKGROUND_VIDEO_DRIVE_FOLDER)
    drive = build_drive_service()
    try:
        return pick_and_download_drive_background(drive, folder_id, destination)
    except HttpError as exc:
        if not is_insufficient_permissions_error(exc):
            raise

        logger.warning("Drive permission missing. Starting Google re-auth.")
        drive = build_drive_service(force_reauth=True)
        return pick_and_download_drive_background(drive, folder_id, destination)

