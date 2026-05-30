"""Persisted Gemini API keys with ordered failover when quota is exceeded."""

from __future__ import annotations

import json
from typing import Any

from .config import GEMINI_API_KEY, GEMINI_API_KEYS_PATH, logger


def mask_api_key(key: str) -> str:
    """Return a safe preview for admin UI (never log or return full keys)."""
    value = (key or "").strip()
    if len(value) <= 8:
        return "••••"
    return f"{value[:4]}••••{value[-4:]}"


def load_api_keys() -> list[str]:
    """Load ordered API keys from JSON file; empty list when missing or invalid."""
    if not GEMINI_API_KEYS_PATH.is_file():
        return []
    try:
        payload = json.loads(GEMINI_API_KEYS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Could not read Gemini API keys file: %s", exc)
        return []
    raw = payload.get("api_keys", payload if isinstance(payload, list) else [])
    if not isinstance(raw, list):
        return []
    keys: list[str] = []
    seen: set[str] = set()
    for item in raw:
        value = str(item).strip()
        if not value or value in seen:
            continue
        seen.add(value)
        keys.append(value)
    return keys


def save_api_keys(keys: list[str]) -> None:
    """Persist ordered unique API keys."""
    cleaned: list[str] = []
    seen: set[str] = set()
    for key in keys:
        value = (key or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        cleaned.append(value)
    GEMINI_API_KEYS_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"api_keys": cleaned}
    GEMINI_API_KEYS_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def get_api_key_chain() -> list[str]:
    """
    Ordered keys for failover: JSON file first, else env GEMINI_API_KEY bootstrap.
    """
    keys = load_api_keys()
    if keys:
        return keys
    if GEMINI_API_KEY:
        return [GEMINI_API_KEY]
    return []


def api_keys_persisted() -> bool:
    return GEMINI_API_KEYS_PATH.is_file() and bool(load_api_keys())


def merge_api_key_updates(existing: list[str], updates: list[str]) -> list[str]:
    """
    Merge admin UI updates into the stored key list.
    Empty string at index = keep existing; non-empty = replace; shorter list drops trailing keys.
    """
    merged: list[str] = []
    for index, update in enumerate(updates):
        value = (update or "").strip()
        if value:
            merged.append(value)
        elif index < len(existing):
            merged.append(existing[index])
    return merged


def is_quota_or_rate_limit_error(exc: BaseException) -> bool:
    """True when Gemini indicates quota/rate-limit — try the next API key."""
    status_code = getattr(getattr(exc, "response", None), "status_code", None)
    if status_code is None:
        status_code = getattr(getattr(exc, "code", None), "value", None)
    if status_code is None:
        status_code = getattr(exc, "status_code", None)
    if status_code == 429:
        return True

    name = type(exc).__name__.upper()
    if "RESOURCEEXHAUSTED" in name or "TOOMANYREQUESTS" in name:
        return True

    message = str(exc).lower()
    hints = (
        "quota",
        "rate limit",
        "rate_limit",
        "too many requests",
        "resource exhausted",
        "exceeded your current quota",
    )
    return any(hint in message for hint in hints)


def api_keys_to_dict() -> dict[str, Any]:
    chain = get_api_key_chain()
    stored = load_api_keys()
    return {
        "api_key_count": len(chain),
        "api_key_previews": [mask_api_key(key) for key in stored],
        "api_keys_persisted": api_keys_persisted(),
        "api_key_configured": bool(chain),
        "api_key_from_env": bool(chain) and not stored and bool(GEMINI_API_KEY),
        "api_keys_path": str(GEMINI_API_KEYS_PATH),
    }
