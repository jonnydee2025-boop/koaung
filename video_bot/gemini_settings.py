"""Persisted Gemini primary + fallback model settings for YouTube metadata."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from typing import Any

from .config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GEMINI_MODEL_FALLBACKS,
    GEMINI_SETTINGS_PATH,
    logger,
)

MODEL_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")

KNOWN_GEMINI_MODELS = (
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
)


@dataclass
class GeminiModelSettings:
    primary_model: str
    fallback_models: list[str]

    def model_chain(self) -> list[str]:
        return dedupe_models([self.primary_model, *self.fallback_models])


def parse_model_list(raw: str) -> list[str]:
    models: list[str] = []
    for part in re.split(r"[\s,]+", raw or ""):
        name = part.strip()
        if name:
            models.append(name)
    return dedupe_models(models)


def dedupe_models(models: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for model in models:
        name = (model or "").strip()
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def validate_model_name(model: str) -> str:
    name = (model or "").strip()
    if not name:
        raise ValueError("Model name cannot be empty.")
    if not MODEL_NAME_RE.fullmatch(name):
        raise ValueError(f"Invalid Gemini model name: {name!r}")
    return name


def validate_gemini_model_settings(settings: GeminiModelSettings) -> None:
    validate_model_name(settings.primary_model)
    for model in settings.fallback_models:
        validate_model_name(model)
    if settings.primary_model.casefold() in {
        model.casefold() for model in settings.fallback_models
    }:
        raise ValueError("Primary model must not also appear in fallback models.")


def default_gemini_model_settings() -> GeminiModelSettings:
    fallbacks = parse_model_list(GEMINI_MODEL_FALLBACKS)
    primary = validate_model_name(GEMINI_MODEL or "gemini-2.0-flash")
    fallbacks = [model for model in fallbacks if model.casefold() != primary.casefold()]
    return GeminiModelSettings(primary_model=primary, fallback_models=fallbacks)


def _settings_from_dict(payload: dict[str, Any]) -> GeminiModelSettings:
    primary = str(payload.get("primary_model", "")).strip()
    raw_fallbacks = payload.get("fallback_models", [])
    if isinstance(raw_fallbacks, str):
        fallbacks = parse_model_list(raw_fallbacks)
    elif isinstance(raw_fallbacks, list):
        fallbacks = [str(item).strip() for item in raw_fallbacks if str(item).strip()]
    else:
        fallbacks = []
    if not primary:
        return default_gemini_model_settings()
    settings = GeminiModelSettings(
        primary_model=primary,
        fallback_models=dedupe_models(
            [model for model in fallbacks if model.casefold() != primary.casefold()],
        ),
    )
    validate_gemini_model_settings(settings)
    return settings


def load_gemini_model_settings() -> GeminiModelSettings:
    if not GEMINI_SETTINGS_PATH.is_file():
        return default_gemini_model_settings()
    try:
        payload = json.loads(GEMINI_SETTINGS_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Gemini settings file must contain a JSON object.")
        return _settings_from_dict(payload)
    except Exception as exc:
        logger.warning(
            "Failed to load %s (%s); using .env defaults.",
            GEMINI_SETTINGS_PATH,
            exc,
        )
        return default_gemini_model_settings()


def save_gemini_model_settings(settings: GeminiModelSettings) -> None:
    validate_gemini_model_settings(settings)
    GEMINI_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "primary_model": settings.primary_model,
        "fallback_models": settings.fallback_models,
    }
    GEMINI_SETTINGS_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def get_gemini_model_chain() -> list[str]:
    return load_gemini_model_settings().model_chain()


def gemini_settings_to_dict(settings: GeminiModelSettings) -> dict[str, Any]:
    return {
        "primary_model": settings.primary_model,
        "fallback_models": settings.fallback_models,
        "model_chain": settings.model_chain(),
        "settings_path": str(GEMINI_SETTINGS_PATH),
        "known_models": list(KNOWN_GEMINI_MODELS),
        "persisted": GEMINI_SETTINGS_PATH.is_file(),
        "api_key_configured": bool(GEMINI_API_KEY),
    }
