"""Tests for consuming row rules after a successful one-time render."""

import unittest
from unittest.mock import MagicMock, patch

from video_bot.row_rules import (
    RowRangeRule,
    batch_anchor_row,
    consume_row_rules_after_render,
)


class RowRulesConsumeTests(unittest.TestCase):
    @patch("video_bot.row_rules.save_row_rules")
    @patch("video_bot.row_rules.load_row_rules")
    def test_removes_rule_for_completed_anchor(
        self,
        mock_load: MagicMock,
        mock_save: MagicMock,
    ) -> None:
        mock_load.return_value = [
            RowRangeRule(
                from_row=4400,
                batch_rows="4400",
                background_video_id="bg1",
                thumbnail_file_id="thumb1",
                background_loop_count=3,
            ),
            RowRangeRule(
                from_row=4500,
                batch_rows="4500",
                background_video_id="bg2",
            ),
        ]

        changed = consume_row_rules_after_render(4400)

        self.assertTrue(changed)
        mock_save.assert_called_once()
        remaining = mock_save.call_args[0][0]
        self.assertEqual(len(remaining), 1)
        self.assertEqual(batch_anchor_row(remaining[0]), 4500)

    @patch("video_bot.row_rules.save_row_rules")
    @patch("video_bot.row_rules.load_row_rules")
    def test_removes_batch_rule_by_anchor(
        self,
        mock_load: MagicMock,
        mock_save: MagicMock,
    ) -> None:
        mock_load.return_value = [
            RowRangeRule(
                from_row=70,
                batch_rows="70, 601, 805",
                background_video_id="bg1",
                thumbnail_file_id="thumb1",
            ),
        ]

        changed = consume_row_rules_after_render(70)

        self.assertTrue(changed)
        mock_save.assert_called_once_with([])

    @patch("video_bot.row_rules.save_row_rules")
    @patch("video_bot.row_rules.load_row_rules")
    def test_skips_repeat_rows(
        self,
        mock_load: MagicMock,
        mock_save: MagicMock,
    ) -> None:
        mock_load.return_value = [
            RowRangeRule(
                from_row=7884,
                batch_rows="7884",
                background_video_id="bg1",
                background_loop_count=2,
            ),
        ]

        changed = consume_row_rules_after_render(7884, is_repeat=True)

        self.assertFalse(changed)
        mock_save.assert_not_called()

    @patch("video_bot.row_rules.save_row_rules")
    @patch("video_bot.row_rules.load_row_rules")
    def test_no_op_when_anchor_has_no_rule(
        self,
        mock_load: MagicMock,
        mock_save: MagicMock,
    ) -> None:
        mock_load.return_value = [
            RowRangeRule(
                from_row=100,
                batch_rows="100",
                background_video_id="bg1",
            ),
        ]

        changed = consume_row_rules_after_render(999)

        self.assertFalse(changed)
        mock_save.assert_not_called()


if __name__ == "__main__":
    unittest.main()
