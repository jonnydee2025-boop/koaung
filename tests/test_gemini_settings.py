"""Tests for Gemini model settings helpers."""

import unittest

from video_bot.gemini_settings import (
    GeminiModelSettings,
    dedupe_models,
    parse_model_list,
    validate_gemini_model_settings,
)


class GeminiSettingsTests(unittest.TestCase):
    def test_parse_model_list_splits_commas_and_spaces(self) -> None:
        self.assertEqual(
            parse_model_list("gemini-2.5-flash, gemini-2.0-flash"),
            ["gemini-2.5-flash", "gemini-2.0-flash"],
        )

    def test_dedupe_models_preserves_order(self) -> None:
        self.assertEqual(
            dedupe_models(["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash"]),
            ["gemini-2.5-flash", "gemini-2.0-flash"],
        )

    def test_model_chain_primary_then_fallbacks(self) -> None:
        settings = GeminiModelSettings(
            primary_model="gemini-2.5-flash",
            fallback_models=["gemini-2.0-flash", "gemini-1.5-flash"],
        )
        self.assertEqual(
            settings.model_chain(),
            ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"],
        )

    def test_validate_rejects_duplicate_primary_in_fallbacks(self) -> None:
        settings = GeminiModelSettings(
            primary_model="gemini-2.5-flash",
            fallback_models=["gemini-2.5-flash"],
        )
        with self.assertRaises(ValueError):
            validate_gemini_model_settings(settings)


if __name__ == "__main__":
    unittest.main()
