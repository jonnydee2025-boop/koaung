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


def cleanup_stale_workdirs(max_age_hours: float = 48) -> None:
    if not TMP_ROOT.is_dir():
        return
    cutoff = time.time() - max_age_hours * 3600
    removed = 0
    for path in TMP_ROOT.iterdir():
        if not path.is_dir() or not path.name.startswith("render_"):
            continue
        try:
            if path.stat().st_mtime < cutoff:
                shutil.rmtree(path, ignore_errors=True)
                removed += 1
        except OSError:
            continue
    if removed:
        logger.info("Cleaned %s stale render folder(s) under %s", removed, TMP_ROOT)
