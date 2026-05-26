"""Generate Burmese YouTube description and SEO tags via Gemini before upload."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from .config import GEMINI_API_KEY, logger
from .gemini_prompt_settings import GeminiPromptSettings, load_gemini_prompt_settings
from .gemini_settings import get_gemini_model_chain

MAX_YOUTUBE_TAGS = 30
MAX_TAG_LENGTH = 30
MAX_TOTAL_TAG_CHARS = 500

CREDIT_LINE_ORDER = (
    "speaker",
    "source_acknowledgement",
    "editorial_note",
    "copyright_notice",
    "channel_note",
    "channel",
)


@dataclass(frozen=True)
class YouTubeMetadata:
    description: str
    tags: list[str]
    title: str | None = None


def sanitize_youtube_tags(keywords: str) -> list[str]:
    """Parse comma-separated keywords into YouTube-safe tag list."""
    raw_parts = re.split(r"[,;\n]+", keywords or "")
    seen: set[str] = set()
    tags: list[str] = []
    total_chars = 0

    for part in raw_parts:
        tag = part.strip().strip('"').strip("'")
        if not tag:
            continue
        if len(tag) > MAX_TAG_LENGTH:
            tag = tag[:MAX_TAG_LENGTH].rstrip()
        key = tag.casefold()
        if key in seen:
            continue
        if total_chars + len(tag) > MAX_TOTAL_TAG_CHARS:
            break
        seen.add(key)
        tags.append(tag)
        total_chars += len(tag)
        if len(tags) >= MAX_YOUTUBE_TAGS:
            break

    return tags


def extract_youtube_tags(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return sanitize_youtube_tags(", ".join(str(item).strip() for item in raw if str(item).strip()))
    return sanitize_youtube_tags(str(raw or ""))


def format_hashtags_line(raw_hashtags: Any) -> str:
    if isinstance(raw_hashtags, list):
        items = raw_hashtags
    elif raw_hashtags is None:
        items = []
    else:
        items = [raw_hashtags]
    return " ".join(
        tag if str(tag).startswith("#") else f"#{str(tag).lstrip('#')}"
        for tag in items
        if str(tag).strip()
    ).strip()


def format_credit_block(raw_credit: Any) -> str:
    if isinstance(raw_credit, str):
        return raw_credit.strip()
    if not isinstance(raw_credit, dict):
        return ""
    lines: list[str] = []
    seen: set[str] = set()
    for key in CREDIT_LINE_ORDER:
        text = str(raw_credit.get(key, "")).strip()
        if text:
            lines.append(text)
            seen.add(key)
    for key, value in raw_credit.items():
        if key in seen:
            continue
        text = str(value).strip()
        if text:
            lines.append(text)
    return "\n\n".join(lines)


def build_description_from_template(
    template: str,
    payload: dict[str, Any],
    *,
    hashtags_field: str,
    credit_field: str,
) -> str:
    values: dict[str, str] = {}
    for key, value in payload.items():
        if isinstance(value, (str, int, float)):
            values[key] = str(value).strip()
        elif isinstance(value, list):
            values[key] = ", ".join(str(item).strip() for item in value if str(item).strip())
    values["hashtags_line"] = format_hashtags_line(payload.get(hashtags_field))
    values["credit_block"] = format_credit_block(payload.get(credit_field))
    try:
        description = template.format(**values).strip()
    except KeyError as exc:
        missing = exc.args[0]
        raise ValueError(
            f"description_template references field {missing!r} missing from Gemini JSON."
        ) from exc
    if not description:
        raise ValueError("Assembled YouTube description is empty.")
    return description


def _parse_gemini_payload(
    payload: dict[str, Any],
    settings: GeminiPromptSettings,
) -> YouTubeMetadata:
    description = build_description_from_template(
        settings.description_template,
        payload,
        hashtags_field=settings.hashtags_field,
        credit_field=settings.credit_field,
    )
    tags: list[str] = []
    if settings.tags_field:
        tags = extract_youtube_tags(payload.get(settings.tags_field))
    title: str | None = None
    if settings.title_field:
        title = str(payload.get(settings.title_field, "")).strip() or None
    return YouTubeMetadata(description=description, tags=tags, title=title)


def generate_youtube_metadata(
    *,
    monk_name: str,
    dhamma_title: str,
) -> YouTubeMetadata | None:
    """
    Generate Burmese YouTube description and tags.
    Returns None when Gemini is not configured or generation fails.
    """
    if not GEMINI_API_KEY:
        return None

    monk = (monk_name or "").strip() or "Unknown monk"
    title = (dhamma_title or "").strip()
    if not title:
        logger.warning("Skipping Gemini metadata: empty dhamma_title.")
        return None

    prompt_settings = load_gemini_prompt_settings()
    user_prompt = prompt_settings.render_user_prompt(
        monk_name=monk,
        dhamma_title=title,
    )
    system_prompt = prompt_settings.render_system_prompt()

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=GEMINI_API_KEY)
        models = get_gemini_model_chain()
        last_error: Exception | None = None

        for model in models:
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=user_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        response_mime_type="application/json",
                        response_schema=prompt_settings.response_schema,
                        temperature=prompt_settings.temperature,
                    ),
                )
                text = (response.text or "").strip()
                if not text:
                    raise ValueError("Empty Gemini response.")
                payload = json.loads(text)
                if not isinstance(payload, dict):
                    raise ValueError("Gemini response was not a JSON object.")
                metadata = _parse_gemini_payload(payload, prompt_settings)
                logger.info(
                    "Gemini YouTube metadata ready with %s (%s tags, %s chars description).",
                    model,
                    len(metadata.tags),
                    len(metadata.description),
                )
                return metadata
            except Exception as exc:
                last_error = exc
                logger.warning("Gemini model %s failed: %s", model, exc)

        if last_error is not None:
            raise last_error
        raise ValueError("No Gemini models configured.")
    except Exception as exc:
        logger.warning("Gemini YouTube metadata generation failed: %s", exc)
        return None
