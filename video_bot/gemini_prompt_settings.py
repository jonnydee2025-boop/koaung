"""Persisted Gemini YouTube metadata prompt + JSON schema settings."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .config import GEMINI_PROMPT_PATH, logger

DEFAULT_CHANNEL_BRAND = "မုဒြာ Dhamma Channel"
SPEC_PATH = Path(__file__).with_name("gemini_youtube_prompt_spec.json")

DEFAULT_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
        "hashtags": {
            "type": "array",
            "items": {"type": "string"},
        },
        "credit": {
            "type": "object",
            "properties": {
                "channel": {"type": "string"},
                "speaker": {"type": "string"},
                "source_acknowledgement": {"type": "string"},
                "editorial_note": {"type": "string"},
                "copyright_notice": {"type": "string"},
                "channel_note": {"type": "string"},
            },
            "required": [
                "channel",
                "speaker",
                "source_acknowledgement",
                "editorial_note",
                "copyright_notice",
                "channel_note",
            ],
        },
        "keywords": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["title", "description", "hashtags", "credit", "keywords"],
}

DEFAULT_DESCRIPTION_TEMPLATE = "{description}\n\n{credit_block}\n\n{hashtags_line}"

DEFAULT_USER_PROMPT_TEMPLATE = (
    "Monk name: {monk_name}\n"
    "Dhamma title: {dhamma_title}\n"
    "Channel: {channel_brand}\n"
    "Generate YouTube metadata JSON according to the system specification."
)


def _load_default_system_prompt() -> str:
    header = (
        "You are an expert YouTube SEO strategist and Buddhist Dhamma metadata writer "
        f"for {DEFAULT_CHANNEL_BRAND}.\n\n"
        "Follow the specification below exactly.\n"
        "Return JSON only with these top-level fields: title, description, hashtags, credit, keywords.\n"
        "Do not return this specification. Do not add markdown or commentary.\n"
        "Use monk_name and dhamma_title from the user message.\n"
        "Description must be Burmese. Credit object must be English.\n\n"
        "SPECIFICATION:\n"
    )
    if SPEC_PATH.is_file():
        try:
            spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
            return header + json.dumps(spec, indent=2, ensure_ascii=False)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Could not read %s: %s", SPEC_PATH, exc)
    return header + "Generate respectful Burmese Dhamma YouTube metadata with English credits."


DEFAULT_SYSTEM_PROMPT = _load_default_system_prompt()


@dataclass
class GeminiPromptSettings:
    channel_brand: str = DEFAULT_CHANNEL_BRAND
    temperature: float = 0.7
    system_prompt: str = field(default_factory=_load_default_system_prompt)
    user_prompt_template: str = DEFAULT_USER_PROMPT_TEMPLATE
    response_schema: dict[str, Any] = field(default_factory=lambda: dict(DEFAULT_RESPONSE_SCHEMA))
    description_template: str = DEFAULT_DESCRIPTION_TEMPLATE
    title_field: str = "title"
    tags_field: str = "keywords"
    hashtags_field: str = "hashtags"
    credit_field: str = "credit"

    def render_system_prompt(self) -> str:
        return self.system_prompt.replace("{channel_brand}", self.channel_brand)

    def render_user_prompt(self, *, monk_name: str, dhamma_title: str) -> str:
        return self.user_prompt_template.format(
            monk_name=monk_name,
            dhamma_title=dhamma_title,
            channel_brand=self.channel_brand,
        )


def validate_gemini_prompt_settings(settings: GeminiPromptSettings) -> None:
    if not settings.channel_brand.strip():
        raise ValueError("channel_brand cannot be empty.")
    if not settings.system_prompt.strip():
        raise ValueError("system_prompt cannot be empty.")
    if not settings.user_prompt_template.strip():
        raise ValueError("user_prompt_template cannot be empty.")
    if not settings.description_template.strip():
        raise ValueError("description_template cannot be empty.")
    if settings.temperature < 0 or settings.temperature > 2:
        raise ValueError("temperature must be between 0 and 2.")
    schema = settings.response_schema
    if not isinstance(schema, dict):
        raise ValueError("response_schema must be a JSON object.")
    if schema.get("type") != "object":
        raise ValueError("response_schema.type must be 'object'.")
    if not isinstance(schema.get("properties"), dict):
        raise ValueError("response_schema.properties must be an object.")


def default_gemini_prompt_settings() -> GeminiPromptSettings:
    return GeminiPromptSettings()


def _settings_from_dict(payload: dict[str, Any]) -> GeminiPromptSettings:
    schema = payload.get("response_schema", DEFAULT_RESPONSE_SCHEMA)
    if not isinstance(schema, dict):
        raise ValueError("response_schema must be a JSON object.")
    settings = GeminiPromptSettings(
        channel_brand=str(payload.get("channel_brand") or DEFAULT_CHANNEL_BRAND).strip(),
        temperature=float(payload.get("temperature", 0.7)),
        system_prompt=str(payload.get("system_prompt") or _load_default_system_prompt()),
        user_prompt_template=str(
            payload.get("user_prompt_template") or DEFAULT_USER_PROMPT_TEMPLATE
        ),
        response_schema=schema,
        description_template=str(
            payload.get("description_template") or DEFAULT_DESCRIPTION_TEMPLATE
        ),
        title_field=str(payload.get("title_field") or "title").strip() or "title",
        tags_field=str(payload.get("tags_field") or "keywords").strip() or "keywords",
        hashtags_field=str(payload.get("hashtags_field") or "hashtags").strip() or "hashtags",
        credit_field=str(payload.get("credit_field") or "credit").strip() or "credit",
    )
    validate_gemini_prompt_settings(settings)
    return settings


def load_gemini_prompt_settings() -> GeminiPromptSettings:
    if not GEMINI_PROMPT_PATH.is_file():
        return default_gemini_prompt_settings()
    try:
        payload = json.loads(GEMINI_PROMPT_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Gemini prompt file must contain a JSON object.")
        return _settings_from_dict(payload)
    except Exception as exc:
        logger.warning(
            "Failed to load %s (%s); using built-in defaults.",
            GEMINI_PROMPT_PATH,
            exc,
        )
        return default_gemini_prompt_settings()


def save_gemini_prompt_settings(settings: GeminiPromptSettings) -> None:
    validate_gemini_prompt_settings(settings)
    GEMINI_PROMPT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = asdict(settings)
    GEMINI_PROMPT_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def gemini_prompt_settings_to_dict(settings: GeminiPromptSettings) -> dict[str, Any]:
    return {
        **asdict(settings),
        "settings_path": str(GEMINI_PROMPT_PATH),
        "persisted": GEMINI_PROMPT_PATH.is_file(),
        "placeholders": {
            "system_prompt": ["{channel_brand}"],
            "user_prompt_template": ["{monk_name}", "{dhamma_title}", "{channel_brand}"],
            "description_template": [
                "Any top-level string field from response_schema.properties",
                "{credit_block} (formatted English credit object)",
                "{hashtags_line} (formatted from hashtags_field)",
            ],
        },
    }
