#!/usr/bin/env python3
"""Live test: verify each Gemini API key in the failover chain responds."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def test_single_key(api_key: str, model: str) -> tuple[str, str]:
    """Return (status, detail) where status is OK, QUOTA, or FAILED."""
    from google import genai

    from video_bot.gemini_api_keys import is_quota_or_rate_limit_error, mask_api_key

    preview = mask_api_key(api_key)
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model,
            contents='Reply with JSON only: {"ok": true}',
            config={"response_mime_type": "application/json"},
        )
        text = (response.text or "").strip()
        if not text:
            return "FAILED", f"{preview}: empty response"
        return "OK", f"{preview}: responded ({len(text)} chars)"
    except Exception as exc:
        if is_quota_or_rate_limit_error(exc):
            return "QUOTA", f"{preview}: quota/rate limit — {exc}"
        return "FAILED", f"{preview}: {exc}"


def main() -> int:
    load_env_file(ROOT / ".env")
    load_env_file(ROOT / "deploy" / "deploy.secrets.env")
    sys.path.insert(0, str(ROOT))

    from video_bot.config import GEMINI_API_KEYS_PATH, GEMINI_MODEL
    from video_bot.gemini_api_keys import get_api_key_chain, mask_api_key
    from video_bot.gemini_settings import get_gemini_model_chain

    chain = get_api_key_chain()
    models = get_gemini_model_chain()
    model = models[0] if models else GEMINI_MODEL or "gemini-2.0-flash"

    print(f"KEYS_PATH: {GEMINI_API_KEYS_PATH}")
    print(f"KEY_COUNT: {len(chain)}")
    print(f"TEST_MODEL: {model}")
    print()

    if not chain:
        print("RESULT: FAILED — no API keys configured")
        print("  Set keys in Admin → Settings → AI or GEMINI_API_KEY in .env")
        return 1

    for index, key in enumerate(chain, start=1):
        print(f"--- Key {index} ({mask_api_key(key)}) ---")
        status, detail = test_single_key(key, model)
        print(f"  {status}: {detail}")
        print()

    # Summary
    results = [test_single_key(key, model)[0] for key in chain]
    ok_count = sum(1 for status in results if status == "OK")
    quota_count = sum(1 for status in results if status == "QUOTA")
    fail_count = sum(1 for status in results if status == "FAILED")

    print("SUMMARY:")
    print(f"  OK: {ok_count}/{len(chain)}")
    print(f"  QUOTA: {quota_count}/{len(chain)}")
    print(f"  FAILED: {fail_count}/{len(chain)}")

    if ok_count == 0:
        print("RESULT: FAILED — no working keys")
        return 1
    if fail_count > 0:
        print("RESULT: PARTIAL — some keys failed (check invalid keys above)")
        return 2
    if quota_count > 0 and ok_count > 0:
        print("RESULT: OK — failover chain has working keys (some on quota)")
        return 0
    print("RESULT: OK — all keys responded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
