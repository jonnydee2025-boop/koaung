"""Generate Burmese YouTube description and SEO tags via Gemini before upload."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from .config import GEMINI_API_KEY, GEMINI_MODEL, logger

CHANNEL_BRAND = "မုဒြာ Dhamma Channel"
MAX_YOUTUBE_TAGS = 30
MAX_TAG_LENGTH = 30
MAX_TOTAL_TAG_CHARS = 500

SYSTEM_PROMPT = f"""You write YouTube video metadata for {CHANNEL_BRAND}, a respectful Burmese Dhamma channel.

Return JSON only with these fields:
- intro: A warm Burmese Dhamma greeting, then exactly 3 sentences summarizing the sermon topic. Write in natural Burmese.
- copyright_disclaimer: Standard boilerplate crediting the monk/speaker and Dhamma audio source, plus a brief disclaimer that visuals are produced for {CHANNEL_BRAND}.
- keywords: One string of 10 to 15 high-performing SEO tags, comma-separated (Burmese and/or English).
- hashtags: An array of 3 to 5 clean hashtags including #တရားတော်, a monk-related tag, and #MudraDhamma or #မုဒြာ.

Keep tone respectful, accurate, and suitable for a Buddhist Dhamma audience. Do not invent facts beyond the title and monk name provided."""

RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "intro": {"type": "string"},
        "copyright_disclaimer": {"type": "string"},
        "keywords": {"type": "string"},
        "hashtags": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["intro", "copyright_disclaimer", "keywords", "hashtags"],
}


@dataclass(frozen=True)
class YouTubeMetadata:
    description: str
    tags: list[str]


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


def assemble_description(
    intro: str,
    copyright_disclaimer: str,
    hashtags: list[str],
) -> str:
    intro_text = (intro or "").strip()
    disclaimer_text = (copyright_disclaimer or "").strip()
    tag_line = " ".join(
        tag if tag.startswith("#") else f"#{tag.lstrip('#')}"
        for tag in (hashtags or [])
        if str(tag).strip()
    ).strip()

    sections = [section for section in (intro_text, disclaimer_text, tag_line) if section]
    return "\n\n".join(sections)


def _parse_gemini_payload(payload: dict[str, Any]) -> YouTubeMetadata:
    intro = str(payload.get("intro", "")).strip()
    disclaimer = str(payload.get("copyright_disclaimer", "")).strip()
    keywords = str(payload.get("keywords", "")).strip()
    raw_hashtags = payload.get("hashtags") or []
    if not isinstance(raw_hashtags, list):
        raw_hashtags = [str(raw_hashtags)]
    hashtags = [str(item).strip() for item in raw_hashtags if str(item).strip()]

    if not intro or not disclaimer or not keywords:
        raise ValueError("Gemini response missing required metadata fields.")

    description = assemble_description(intro, disclaimer, hashtags)
    tags = sanitize_youtube_tags(keywords)
    if not description:
        raise ValueError("Assembled YouTube description is empty.")

    return YouTubeMetadata(description=description, tags=tags)


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

    user_prompt = (
        f"Monk name: {monk}\n"
        f"Dhamma title: {title}\n"
        f"Channel: {CHANNEL_BRAND}\n"
        "Generate the JSON metadata for this YouTube upload."
    )

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=RESPONSE_SCHEMA,
                temperature=0.7,
            ),
        )
        text = (response.text or "").strip()
        if not text:
            raise ValueError("Empty Gemini response.")
        payload = json.loads(text)
        if not isinstance(payload, dict):
            raise ValueError("Gemini response was not a JSON object.")
        metadata = _parse_gemini_payload(payload)
        logger.info(
            "Gemini YouTube metadata ready (%s tags, %s chars description).",
            len(metadata.tags),
            len(metadata.description),
        )
        return metadata
    except Exception as exc:
        logger.warning("Gemini YouTube metadata generation failed: %s", exc)
        return None
