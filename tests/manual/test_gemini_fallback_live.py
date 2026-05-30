#!/usr/bin/env python3
"""Live test: verify Gemini model fallback chain on VPS/local .env."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

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

    from google import genai

    from video_bot.config import GEMINI_API_KEY
    from video_bot.gemini_api_keys import get_api_key_chain
    from video_bot.gemini_settings import load_gemini_model_settings
    from video_bot.gemini_youtube_metadata import generate_youtube_metadata

    key_chain = get_api_key_chain()
    if not key_chain:
        print("RESULT: FAILED — no Gemini API keys configured")
        return 1

    settings = load_gemini_model_settings()
    chain = settings.model_chain()
    print(f"API_KEY_COUNT: {len(key_chain)}")
    print("MODEL_CHAIN:")
    for index, model in enumerate(chain, start=1):
        print(f"  {index}. {model}")
    print(f"FALLBACK_COUNT: {len(settings.fallback_models)}")
    print()

    print("TEST 1: Normal generation (first working model in chain)")
    result = generate_youtube_metadata(
        monk_name="Test Sayadaw",
        dhamma_title="Metta Meditation Basics",
    )
    if result is None:
        print("  RESULT: FAILED — all models in chain failed")
        return 1
    print(
        f"  RESULT: OK — {len(result.tags)} tags, "
        f"{len(result.description)} chars description"
    )
    print()

    if len(chain) < 2:
        print("TEST 2: Skipped — need at least 2 models to test fallback")
        return 0

    print("TEST 2: Simulated fallback (force primary to fail)")
    primary, fallback = chain[0], chain[1]
    calls: list[str] = []
    real_client = genai.Client(api_key=key_chain[0])
    real_generate = real_client.models.generate_content

    def tracked_generate(*, model, **kwargs):
        calls.append(model)
        if model == primary:
            raise RuntimeError(f"Simulated failure for primary model {primary}")
        return real_generate(model=model, **kwargs)

    mock_models = MagicMock()
    mock_models.generate_content.side_effect = tracked_generate
    mock_client = MagicMock()
    mock_client.models = mock_models

    with patch(
        "google.genai.Client",
        return_value=mock_client,
    ):
        fallback_result = generate_youtube_metadata(
            monk_name="Test Sayadaw",
            dhamma_title="Anicca Reflection",
        )

    print(f"  Models tried: {calls}")
    if fallback_result is None:
        print("  RESULT: FAILED — fallback did not produce metadata")
        return 1
    if calls[:2] != [primary, fallback]:
        print(f"  RESULT: FAILED — expected [{primary}, {fallback}], got {calls[:2]}")
        return 1
    print(f"  RESULT: OK — primary failed, fallback {fallback} succeeded")
    print(f"  TAGS: {fallback_result.tags[:5]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
