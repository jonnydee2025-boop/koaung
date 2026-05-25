"""Tests for Gemini YouTube metadata helpers."""

import unittest

from video_bot.gemini_youtube_metadata import (
    assemble_description,
    sanitize_youtube_tags,
    _parse_gemini_payload,
)


class GeminiYouTubeMetadataTests(unittest.TestCase):
    def test_sanitize_youtube_tags_dedupes_and_limits_length(self) -> None:
        keywords = "Dhamma, dhamma, Meditation, " + "x" * 40 + ", tag2, tag3"
        tags = sanitize_youtube_tags(keywords)
        self.assertIn("Dhamma", tags)
        self.assertEqual(len(tags), len({tag.casefold() for tag in tags}))
        self.assertTrue(all(len(tag) <= 30 for tag in tags))

    def test_assemble_description_joins_sections(self) -> None:
        description = assemble_description(
            "မင်္ဂလာပါ။",
            "Audio credit: Sayadaw.",
            ["#တရားတော်", "#MudraDhamma"],
        )
        self.assertIn("မင်္ဂလာပါ။", description)
        self.assertIn("Audio credit: Sayadaw.", description)
        self.assertIn("#တရားတော်", description)
        self.assertIn("#MudraDhamma", description)

    def test_parse_gemini_payload_builds_metadata(self) -> None:
        metadata = _parse_gemini_payload(
            {
                "intro": "Intro text",
                "copyright_disclaimer": "Credits text",
                "keywords": "Dhamma, Myanmar, Buddhism",
                "hashtags": ["#တရားတော်", "#MudraDhamma"],
            }
        )
        self.assertIn("Intro text", metadata.description)
        self.assertEqual(metadata.tags, ["Dhamma", "Myanmar", "Buddhism"])


if __name__ == "__main__":
    unittest.main()
