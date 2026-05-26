"""Tests for Gemini YouTube metadata helpers."""

import unittest

from video_bot.gemini_prompt_settings import default_gemini_prompt_settings
from video_bot.gemini_youtube_metadata import (
    _parse_gemini_payload,
    format_credit_block,
    sanitize_youtube_tags,
)


class GeminiYouTubeMetadataTests(unittest.TestCase):
    def test_sanitize_youtube_tags_dedupes_and_limits_length(self) -> None:
        keywords = "Dhamma, dhamma, Meditation, " + "x" * 40 + ", tag2, tag3"
        tags = sanitize_youtube_tags(keywords)
        self.assertIn("Dhamma", tags)
        self.assertEqual(len(tags), len({tag.casefold() for tag in tags}))
        self.assertTrue(all(len(tag) <= 30 for tag in tags))

    def test_format_credit_block(self) -> None:
        block = format_credit_block(
            {
                "speaker": "Dhamma discourse by Venerable U Pandita",
                "source_acknowledgement": "Original teachings belong to the speaker.",
                "channel_note": "May all beings be peaceful.",
            }
        )
        self.assertIn("U Pandita", block)
        self.assertIn("Original teachings", block)

    def test_parse_gemini_payload_builds_metadata(self) -> None:
        settings = default_gemini_prompt_settings()
        metadata = _parse_gemini_payload(
            {
                "title": "SEO Title | Myanmar Dhamma",
                "description": "Burmese description text",
                "keywords": ["Myanmar Dhamma", "Buddhist sermon", "Meditation"],
                "hashtags": ["#တရားတော်", "#MudraDhammaChannel"],
                "credit": {
                    "channel": "Mudra Dhamma Channel",
                    "speaker": "Dhamma discourse by Venerable Sayadaw",
                    "source_acknowledgement": "Original teachings belong to the speaker.",
                    "editorial_note": "Edited and published by Mudra Dhamma Channel.",
                    "copyright_notice": "For Buddhist educational purposes.",
                    "channel_note": "May all beings be peaceful.",
                },
            },
            settings,
        )
        self.assertEqual(metadata.title, "SEO Title | Myanmar Dhamma")
        self.assertIn("Burmese description text", metadata.description)
        self.assertIn("Sayadaw", metadata.description)
        self.assertIn("#တရားတော်", metadata.description)
        self.assertEqual(metadata.tags, ["Myanmar Dhamma", "Buddhist sermon", "Meditation"])


if __name__ == "__main__":
    unittest.main()
