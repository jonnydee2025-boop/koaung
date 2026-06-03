"""Tests for render shutdown cleanup."""

import unittest
from unittest.mock import patch

from video_bot import state
from video_bot.render_cleanup import cleanup_active_render


class RenderCleanupTests(unittest.TestCase):
    def setUp(self) -> None:
        state.reset_current_render_idle()
        state.active_ffmpeg_process = None
        state.render_cancel_requested = False

    def test_idle_with_stale_row_number_does_not_mark_sheet_failed(self) -> None:
        state.current_render.update({
            "running": False,
            "row_number": 42,
            "status": "Done",
        })

        with patch("video_bot.render_cleanup.mark_row_failed") as mock_fail:
            cleaned = cleanup_active_render("Bot shut down — render interrupted")

        self.assertFalse(cleaned)
        mock_fail.assert_not_called()
        self.assertEqual(state.current_render["row_number"], 0)

    def test_active_render_marks_sheet_row_failed(self) -> None:
        state.current_render.update({
            "running": True,
            "row_number": 42,
            "status": "Encoding",
        })

        with patch("video_bot.render_cleanup.mark_row_failed") as mock_fail:
            cleaned = cleanup_active_render("Bot shut down — render interrupted")

        self.assertTrue(cleaned)
        mock_fail.assert_called_once_with(42, "Bot shut down — render interrupted")
        self.assertEqual(state.current_render["row_number"], 0)


if __name__ == "__main__":
    unittest.main()
