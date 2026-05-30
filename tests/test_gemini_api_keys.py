"""Tests for Gemini API key failover helpers."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from video_bot.gemini_api_keys import (
    get_api_key_chain,
    is_quota_or_rate_limit_error,
    load_api_keys,
    mask_api_key,
    merge_api_key_updates,
    save_api_keys,
)
from video_bot.gemini_prompt_settings import default_gemini_prompt_settings
from video_bot.gemini_youtube_metadata import YouTubeMetadata, generate_youtube_metadata


class GeminiApiKeysTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.keys_path = Path(self.temp_dir.name) / "gemini_api_keys.json"
        self.env_patch = patch("video_bot.gemini_api_keys.GEMINI_API_KEY", "")
        self.path_patch = patch(
            "video_bot.gemini_api_keys.GEMINI_API_KEYS_PATH",
            self.keys_path,
        )
        self.env_patch.start()
        self.path_patch.start()

    def tearDown(self) -> None:
        self.path_patch.stop()
        self.env_patch.stop()
        self.temp_dir.cleanup()

    def test_mask_api_key_hides_middle(self) -> None:
        self.assertEqual(mask_api_key("AIzaSyAbCdEfGhIjKlMn"), "AIza••••KlMn")

    def test_save_and_load_api_keys(self) -> None:
        save_api_keys(["key-one", "key-two"])
        self.assertEqual(load_api_keys(), ["key-one", "key-two"])
        payload = json.loads(self.keys_path.read_text(encoding="utf-8"))
        self.assertEqual(payload, {"api_keys": ["key-one", "key-two"]})

    def test_merge_api_key_updates_keep_replace_remove(self) -> None:
        existing = ["keep-me", "replace-me", "drop-me"]
        updates = ["", "new-key"]
        self.assertEqual(
            merge_api_key_updates(existing, updates),
            ["keep-me", "new-key"],
        )

    def test_merge_api_key_updates_append(self) -> None:
        existing = ["first"]
        updates = ["", "second"]
        self.assertEqual(merge_api_key_updates(existing, updates), ["first", "second"])

    def test_get_api_key_chain_falls_back_to_env(self) -> None:
        with patch("video_bot.gemini_api_keys.GEMINI_API_KEY", "env-key"):
            self.assertEqual(get_api_key_chain(), ["env-key"])

    def test_is_quota_or_rate_limit_error_detects_429(self) -> None:
        exc = Exception("too many requests")
        exc.status_code = 429
        self.assertTrue(is_quota_or_rate_limit_error(exc))

    def test_is_quota_or_rate_limit_error_detects_message(self) -> None:
        self.assertTrue(is_quota_or_rate_limit_error(Exception("Quota exceeded for model")))

    def test_is_quota_or_rate_limit_error_rejects_other_errors(self) -> None:
        self.assertFalse(is_quota_or_rate_limit_error(Exception("invalid model name")))


class GeminiKeyFailoverGenerationTests(unittest.TestCase):
    def test_generate_youtube_metadata_rotates_key_on_quota(self) -> None:
        settings = default_gemini_prompt_settings()
        metadata = YouTubeMetadata(
            description="Burmese description",
            tags=["tag1"],
            title="Title",
        )
        clients: list[MagicMock] = []

        def client_factory(*, api_key: str) -> MagicMock:
            client = MagicMock()
            client.api_key = api_key

            def generate_side_effect(*, model, **kwargs):
                if api_key == "key-one":
                    raise Exception("429 RESOURCE_EXHAUSTED quota exceeded")
                payload = {
                    settings.title_field: metadata.title,
                    settings.tags_field: metadata.tags,
                    settings.hashtags_field: [],
                    settings.credit_field: {"channel": "Test"},
                    "description": metadata.description,
                }
                response = MagicMock()
                response.text = json.dumps(payload)
                return response

            client.models.generate_content.side_effect = generate_side_effect
            clients.append(client)
            return client

        with patch(
            "video_bot.gemini_youtube_metadata.get_api_key_chain",
            return_value=["key-one", "key-two"],
        ), patch(
            "video_bot.gemini_youtube_metadata.get_gemini_model_chain",
            return_value=["gemini-2.0-flash"],
        ), patch(
            "video_bot.gemini_youtube_metadata.load_gemini_prompt_settings",
            return_value=settings,
        ), patch("google.genai.Client", side_effect=client_factory):
            result = generate_youtube_metadata(
                monk_name="Sayadaw",
                dhamma_title="Metta talk",
            )

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.title, metadata.title)
        self.assertEqual(len(clients), 2)
        self.assertEqual(clients[0].api_key, "key-one")
        self.assertEqual(clients[1].api_key, "key-two")


if __name__ == "__main__":
    unittest.main()
