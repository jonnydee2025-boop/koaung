"""Download, enhance, and concatenate audio for multi-row batch rules."""

from pathlib import Path
from typing import Callable

from ..config import ENABLE_AUDIO_ENHANCE
from ..media import concat_audio_tracks, download_file, enhance_audio
from ..models import SheetRow
from ..sheets import get_sheet_rows_by_numbers
from .row_helpers import get_required


def build_combined_field(
    batch_rows: list[SheetRow],
    field: str,
    *,
    separator: str = " | ",
) -> str:
    parts: list[str] = []
    for batch_row in batch_rows:
        value = batch_row.values.get(field, "").strip()
        if value:
            parts.append(value)
    return separator.join(parts)


def prepare_batch_audio(
    *,
    all_rows: list[SheetRow],
    batch_row_numbers: list[int],
    workdir: Path,
    job_progress: Callable | None,
) -> Path:
    batch_sheet_rows = get_sheet_rows_by_numbers(all_rows, batch_row_numbers)
    track_paths: list[Path] = []

    for index, batch_row in enumerate(batch_sheet_rows):
        mp3_url = get_required(batch_row, "mp3_url")
        mp3_path = workdir / f"track_{batch_row.row_number}.mp3"
        if job_progress is not None:
            job_progress(
                f"Downloading MP3 ({index + 1}/{len(batch_sheet_rows)})",
                None,
            )
        download_file(mp3_url, mp3_path)

        if ENABLE_AUDIO_ENHANCE:
            wav_path = workdir / f"track_{batch_row.row_number}.wav"
            if job_progress is not None:
                job_progress(
                    f"Enhancing audio ({index + 1}/{len(batch_sheet_rows)})",
                    0.0,
                )
            enhance_audio(mp3_path, wav_path, job_progress)
            track_paths.append(wav_path)
        else:
            track_paths.append(mp3_path)

    combined_path = workdir / "combined.wav"
    if job_progress is not None:
        job_progress("Concatenating batch audio", 0.0)
    concat_audio_tracks(track_paths, combined_path, job_progress)
    if job_progress is not None:
        job_progress("Finished batch audio", None)
    return combined_path
