"""Temporary render directory lifecycle."""

import shutil
import time
from pathlib import Path

from ..config import TMP_ROOT, logger


def unlink_if_exists(path: Path | None) -> None:
    if path is None or not path.exists():
        return
    try:
        path.unlink()
    except OSError as exc:
        logger.warning("Could not delete %s: %s", path, exc)


def _row_from_workdir_name(name: str) -> int | None:
    if not name.startswith("render_"):
        return None
    parts = name.split("_", 2)
    if len(parts) < 2:
        return None
    try:
        return int(parts[1])
    except ValueError:
        return None


def find_render_workdir(row_number: int) -> Path | None:
    """Return the newest temp workdir for a sheet row, if any."""
    if not TMP_ROOT.is_dir():
        return None
    prefix = f"render_{row_number}_"
    candidates = [
        path
        for path in TMP_ROOT.iterdir()
        if path.is_dir() and path.name.startswith(prefix)
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)


def find_rendered_video(workdir: Path | None) -> Path | None:
    """Return the newest non-empty MP4 in a render workdir."""
    if workdir is None or not workdir.is_dir():
        return None
    videos = sorted(
        workdir.glob("*.mp4"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for path in videos:
        try:
            if path.is_file() and path.stat().st_size > 0:
                return path
        except OSError:
            continue
    return None


def delete_render_files_after_youtube_upload(
    *,
    video_path: Path,
    background_path: Path,
    mp3_path: Path,
    enhanced_audio_path: Path,
    render_audio_path: Path,
) -> None:
    unlink_if_exists(video_path)
    unlink_if_exists(background_path)
    unlink_if_exists(mp3_path)
    if render_audio_path != mp3_path:
        unlink_if_exists(enhanced_audio_path)
    logger.info("Deleted rendered video and source files from VPS after YouTube upload.")


def purge_workdir(workdir: Path) -> None:
    if workdir.exists():
        shutil.rmtree(workdir, ignore_errors=True)
        logger.info("Removed render workdir from VPS: %s", workdir)


def cleanup_stale_workdirs(
    max_age_hours: float = 48,
    *,
    protected_row_numbers: set[int] | None = None,
) -> None:
    if not TMP_ROOT.is_dir():
        return
    protected = protected_row_numbers or set()
    cutoff = time.time() - max_age_hours * 3600
    removed = 0
    for path in TMP_ROOT.iterdir():
        if not path.is_dir() or not path.name.startswith("render_"):
            continue
        row_number = _row_from_workdir_name(path.name)
        if row_number is not None and row_number in protected:
            continue
        try:
            if path.stat().st_mtime < cutoff:
                shutil.rmtree(path, ignore_errors=True)
                removed += 1
        except OSError:
            continue
    if removed:
        logger.info("Cleaned %s stale render folder(s) under %s", removed, TMP_ROOT)
