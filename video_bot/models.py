from dataclasses import dataclass
from pathlib import Path


@dataclass
class SheetRow:
    row_number: int
    values: dict[str, str]


@dataclass
class RetryJob:
    mode: str
    row: SheetRow
    title: str
    description: str
    video_id: str | None = None
    thumbnail_warning: str = ""
    workdir: Path | None = None
    video_path: Path | None = None
    thumbnail_path: Path | None = None


@dataclass
class PendingThumbnailJob:
    video_id: str
    title: str
    row_number: int
    auto_thumbnail_path: Path
    workdir: Path
    monk_name: str = ""


@dataclass(frozen=True)
class DriveBackgroundVideo:
    file_id: str
    name: str


class RenderTaskFailed(Exception):
    def __init__(self, message: str, retry_id: str | None = None) -> None:
        super().__init__(message)
        self.retry_id = retry_id


class NoPendingRows(Exception):
    pass

