#!/usr/bin/env python3
"""One-off live test: verify GEMINI_API_KEY responds on VPS or local .env."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / ".env"


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def main() -> int:
    load_env(ENV_PATH)
    sys.path.insert(0, str(ROOT))

    from video_bot.config import GEMINI_API_KEY, GEMINI_MODEL
    from video_bot.gemini_youtube_metadata import generate_youtube_metadata

    print(f"KEY_SET: {bool(GEMINI_API_KEY)} (len={len(GEMINI_API_KEY)})")
    print(f"MODEL: {GEMINI_MODEL}")

    if not GEMINI_API_KEY:
        print("RESULT: FAILED — GEMINI_API_KEY is empty")
        return 1

    result = generate_youtube_metadata(
        monk_name="Test Sayadaw",
        dhamma_title="Metta Meditation Basics",
    )
    if result is None:
        print("RESULT: FAILED — Gemini returned None (check logs above)")
        return 1

    preview = result.description[:160].replace("\n", " ")
    print("RESULT: OK — Gemini responded successfully")
    print(f"TAGS: {len(result.tags)} -> {result.tags[:5]}")
    print(f"DESC_PREVIEW: {preview}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
