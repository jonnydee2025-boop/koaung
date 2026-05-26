"""Tests for editable Gemini YouTube prompt settings."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from video_bot.gemini_prompt_settings import (
    GeminiPromptSettings,
    default_gemini_prompt_settings,
    load_gemini_prompt_settings,
    save_gemini_prompt_settings,
    validate_gemini_prompt_settings,
)
from video_bot.gemini_youtube_metadata import (
    _parse_gemini_payload,
    build_description_from_template,
)


class GeminiPromptSettingsTests(unittest.TestCase):
    def test_default_settings_validate(self) -> None:
        settings = default_gemini_prompt_settings()
        validate_gemini_prompt_settings(settings)
        rendered = settings.render_user_prompt(
            monk_name="Sayadaw",
            dhamma_title="Test title",
        )
        self.assertIn("Sayadaw", rendered)
        self.assertIn("Test title", rendered)

    def test_custom_description_template(self) -> None:
        settings = GeminiPromptSettings(
            description_template="{summary}\n\n{hashtags_line}",
            tags_field="tags",
            hashtags_field="hashtags",
            credit_field="credit",
            response_schema={
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "tags": {"type": "string"},
                    "hashtags": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["summary", "tags", "hashtags"],
            },
        )
        metadata = _parse_gemini_payload(
            {
                "summary": "Summary text",
                "tags": "Dhamma, Myanmar",
                "hashtags": ["#tag1"],
            },
            settings,
        )
        self.assertIn("Summary text", metadata.description)
        self.assertIn("#tag1", metadata.description)
        self.assertEqual(metadata.tags, ["Dhamma", "Myanmar"])

    def test_save_and_load_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "gemini_youtube_prompt.json"
            settings = default_gemini_prompt_settings()
            settings.system_prompt = "Custom system {channel_brand}"
            with patch("video_bot.gemini_prompt_settings.GEMINI_PROMPT_PATH", path):
                save_gemini_prompt_settings(settings)
                loaded = load_gemini_prompt_settings()
            self.assertEqual(loaded.system_prompt, "Custom system {channel_brand}")
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(payload["system_prompt"], "Custom system {channel_brand}")

    def test_build_description_hashtags_line(self) -> None:
        description = build_description_from_template(
            "{intro}\n{hashtags_line}",
            {"intro": "Hello", "hashtags": ["#a", "b"]},
            hashtags_field="hashtags",
            credit_field="credit",
        )
        self.assertIn("Hello", description)
        self.assertIn("#a", description)
        self.assertIn("#b", description)

    def test_mudra_style_payload(self) -> None:
        settings = default_gemini_prompt_settings()
        metadata = _parse_gemini_payload(
            {
                "title": "Title",
                "description": "Desc",
                "hashtags": ["#Dhamma"],
                "credit": {"speaker": "Speaker line", "channel_note": "Blessing"},
                "keywords": ["a", "b"],
            },
            settings,
        )
        self.assertIn("Speaker line", metadata.description)
        self.assertIn("#Dhamma", metadata.description)


if __name__ == "__main__":
    unittest.main()
