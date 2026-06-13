"""Tests for repeat-job background and loop settings."""

import unittest
from unittest.mock import patch

from video_bot.repeat_jobs import RepeatJob, validate_repeat_job
from video_bot.row_rules import (
    RowRangeRule,
    batch_anchor_row,
    clear_row_rules_for_repeat_anchor,
    prune_row_rules_for_repeat_anchors,
)


class RepeatMediaSettingsTests(unittest.TestCase):
    def test_repeat_job_stores_background_and_loop(self) -> None:
        job = RepeatJob(
            anchor_row=4400,
            repeat_type="daily",
            background_video_id="bg1",
            background_video_name="clip.mp4",
            background_loop_count=2,
        )
        validate_repeat_job(job)
        self.assertEqual(job.background_video_id, "bg1")
        self.assertEqual(job.background_loop_count, 2)

    @patch("video_bot.row_rules.save_row_rules")
    @patch("video_bot.row_rules.load_row_rules")
    def test_clear_row_rules_for_repeat_anchor(
        self,
        mock_load,
        mock_save,
    ) -> None:
        mock_load.return_value = [
            RowRangeRule(
                from_row=4400,
                batch_rows="4400",
                background_video_id="bg1",
                background_loop_count=2,
            ),
            RowRangeRule(
                from_row=4500,
                batch_rows="4500",
                thumbnail_file_id="t1",
            ),
        ]

        changed = clear_row_rules_for_repeat_anchor(4400)

        self.assertTrue(changed)
        remaining = mock_save.call_args[0][0]
        self.assertEqual(len(remaining), 1)
        self.assertEqual(batch_anchor_row(remaining[0]), 4500)

    @patch("video_bot.row_rules.save_row_rules")
    @patch("video_bot.row_rules.load_row_rules")
    def test_prune_row_rules_for_repeat_anchors(
        self,
        mock_load,
        mock_save,
    ) -> None:
        mock_load.return_value = [
            RowRangeRule(from_row=7884, batch_rows="7884", background_video_id="bg1"),
        ]

        changed = prune_row_rules_for_repeat_anchors({7884, 9999})

        self.assertTrue(changed)
        mock_save.assert_called_once_with([])


if __name__ == "__main__":
    unittest.main()
