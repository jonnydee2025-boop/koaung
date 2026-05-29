import json
import re
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests

from .config import FFMPEG_BIN, FFPROBE_BIN
from .state import ProgressCallback
import video_bot.state as _state


def google_drive_direct_url(url: str) -> str:
    parsed = urlparse(url)
    if "drive.google.com" not in parsed.netloc:
        return url

    match = re.search(r"/file/d/([^/]+)", parsed.path)
    file_id = match.group(1) if match else parse_qs(parsed.query).get("id", [None])[0]
    if not file_id:
        return url

    return f"https://drive.google.com/uc?export=download&id={file_id}"


def _remote_get_response(
    session: requests.Session,
    resolved_url: str,
    *,
    request_headers: dict[str, str] | None = None,
) -> requests.Response:
    headers = dict(request_headers or {})
    response = session.get(resolved_url, stream=True, timeout=120, headers=headers)

    token = next(
        (
            value
            for key, value in response.cookies.items()
            if key.startswith("download_warning")
        ),
        None,
    )
    if token:
        response.close()
        response = session.get(
            resolved_url,
            params={"confirm": token},
            stream=True,
            timeout=120,
            headers=headers,
        )

    response.raise_for_status()
    return response


def stream_remote_file(
    url: str,
    *,
    range_header: str | None = None,
    chunk_size: int = 1024 * 1024,
) -> tuple[int, dict[str, str], Iterator[bytes]]:
    """Stream a remote file; optional HTTP Range for partial content (206)."""
    resolved_url = google_drive_direct_url(url)
    session = requests.Session()
    req_headers: dict[str, str] = {}
    if range_header:
        req_headers["Range"] = range_header
    response = _remote_get_response(
        session,
        resolved_url,
        request_headers=req_headers,
    )

    def generate() -> Iterator[bytes]:
        try:
            for chunk in response.iter_content(chunk_size=chunk_size):
                if chunk:
                    yield chunk
        finally:
            response.close()
            session.close()

    out_headers: dict[str, str] = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
    }
    for key in ("Content-Length", "Content-Range", "Content-Type"):
        value = response.headers.get(key)
        if value:
            out_headers[key] = value

    return response.status_code, out_headers, generate()


def iter_remote_file(url: str, chunk_size: int = 1024 * 1024):
    _, _, chunks = stream_remote_file(url, chunk_size=chunk_size)
    yield from chunks


def download_file(url: str, destination: Path) -> None:
    with destination.open("wb") as output:
        for chunk in iter_remote_file(url):
            output.write(chunk)


def run_subprocess(command: list[str]) -> None:
    completed = subprocess.run(
        command,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())


def parse_ffmpeg_progress_seconds(line: str) -> float | None:
    if line.startswith(("out_time_ms=", "out_time_us=")):
        value = line.split("=", 1)[1].strip()
        if value == "N/A":
            return None

        try:
            return int(value) / 1_000_000
        except ValueError:
            return None

    if line.startswith("out_time="):
        value = line.split("=", 1)[1].strip()
        if value == "N/A":
            return None

        try:
            hours, minutes, seconds = value.split(":")
            return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
        except ValueError:
            return None

    return None


def progress_bar(percent: float, width: int = 30) -> str:
    percent = max(0.0, min(100.0, percent))
    filled = int(width * percent / 100)
    return f"[{'#' * filled}{'.' * (width - filled)}] {percent:5.1f}%"


def run_ffmpeg_with_progress(
    command: list[str],
    duration: float,
    progress_callback: ProgressCallback | None = None,
    status_label: str = "Rendering video",
) -> None:
    progress_command = [
        command[0],
        "-hide_banner",
        "-loglevel",
        "error",
        "-progress",
        "pipe:1",
        *command[1:],
    ]
    process = subprocess.Popen(
        progress_command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    _state.active_ffmpeg_process = process

    last_percent = -1.0
    if progress_callback is not None:
        progress_callback(status_label, 0.0)

    if process.stdout is not None:
        for raw_line in process.stdout:
            seconds = parse_ffmpeg_progress_seconds(raw_line.strip())
            if seconds is None or duration <= 0:
                continue

            percent = min(100.0, (seconds / duration) * 100)
            if percent - last_percent >= 1 or percent >= 100:
                sys.stderr.write(f"\r{status_label}: {progress_bar(percent)}")
                sys.stderr.flush()
                last_percent = percent
                if progress_callback is not None:
                    progress_callback(status_label, percent)

    return_code = process.wait()
    _state.active_ffmpeg_process = None
    
    stderr = process.stderr.read().strip() if process.stderr is not None else ""
    sys.stderr.write(f"\r{status_label}: {progress_bar(100)}\n")
    sys.stderr.flush()

    if return_code != 0:
        raise RuntimeError(stderr or f"FFmpeg failed while {status_label.lower()}.")

    if progress_callback is not None:
        progress_callback(f"Finished {status_label.lower()}", None)


def get_media_duration_seconds(media_path: Path) -> float:
    command = [
        FFPROBE_BIN,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(media_path),
    ]
    completed = subprocess.run(
        command,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    duration = json.loads(completed.stdout)["format"]["duration"]
    return float(duration)


def build_voice_enhancement_filter() -> str:
    return ",".join(
        [
            "highpass=f=85",
            "afftdn=nf=-25",
            "acompressor=threshold=-22dB:ratio=3:attack=8:release=120:makeup=3",
            "equalizer=f=1800:t=q:w=1.2:g=2",
            "equalizer=f=3200:t=q:w=1.1:g=3.5",
            "loudnorm=I=-14:TP=-1.5:LRA=10",
        ]
    )


def enhance_audio(
    input_path: Path,
    output_path: Path,
    progress_callback: ProgressCallback | None = None,
) -> None:
    duration = get_media_duration_seconds(input_path)
    command = [
        FFMPEG_BIN,
        "-y",
        "-i",
        str(input_path),
        "-af",
        build_voice_enhancement_filter(),
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
        str(output_path),
    ]
    run_ffmpeg_with_progress(
        command,
        duration,
        progress_callback,
        status_label="Enhancing audio",
    )


def concat_audio_tracks(
    track_paths: list[Path],
    output_path: Path,
    progress_callback: ProgressCallback | None = None,
) -> float:
    if len(track_paths) < 2:
        raise ValueError("concat_audio_tracks requires at least two tracks.")

    total_duration = sum(
        get_media_duration_seconds(path) for path in track_paths
    )
    filter_parts: list[str] = []
    concat_inputs: list[str] = []
    for index in range(len(track_paths)):
        label = f"a{index}"
        filter_parts.append(
            f"[{index}:a]aresample=48000,"
            f"aformat=sample_fmts=s16:channel_layouts=stereo[{label}]"
        )
        concat_inputs.append(f"[{label}]")
    n = len(track_paths)
    filter_parts.append(f"{''.join(concat_inputs)}concat=n={n}:v=0:a=1[outa]")
    filter_complex = ";".join(filter_parts)

    command = [FFMPEG_BIN, "-y"]
    for path in track_paths:
        command.extend(["-i", str(path)])
    command.extend(
        [
            "-filter_complex",
            filter_complex,
            "-map",
            "[outa]",
            "-c:a",
            "pcm_s16le",
            "-ar",
            "48000",
            str(output_path),
        ]
    )
    run_ffmpeg_with_progress(
        command,
        total_duration,
        progress_callback,
        status_label="Concatenating audio",
    )
    return get_media_duration_seconds(output_path)


RENDER_VIDEO_FILTER = (
    "scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,"
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"
)


def _render_video_output_args() -> list[str]:
    return [
        "-vf",
        RENDER_VIDEO_FILTER,
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
    ]


def render_video(
    mp3_path: Path,
    background_path: Path,
    output_path: Path,
    progress_callback: ProgressCallback | None = None,
    *,
    background_loop_count: int | None = None,
) -> None:
    track_duration = get_media_duration_seconds(mp3_path)
    if background_loop_count is None or background_loop_count < 1:
        output_duration = track_duration
        command = [
            FFMPEG_BIN,
            "-y",
            "-stream_loop",
            "-1",
            "-i",
            str(background_path),
            "-i",
            str(mp3_path),
            "-t",
            f"{output_duration:.3f}",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            *_render_video_output_args(),
            "-shortest",
            str(output_path),
        ]
    else:
        loop_times = background_loop_count
        stream_loop = str(loop_times - 1)
        output_duration = track_duration * loop_times
        command = [
            FFMPEG_BIN,
            "-y",
            "-stream_loop",
            stream_loop,
            "-i",
            str(background_path),
            "-stream_loop",
            stream_loop,
            "-i",
            str(mp3_path),
            "-t",
            f"{output_duration:.3f}",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            *_render_video_output_args(),
            str(output_path),
        ]
    run_ffmpeg_with_progress(
        command,
        output_duration,
        progress_callback,
        status_label="Rendering video",
    )
