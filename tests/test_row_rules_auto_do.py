"""Tests for auto-triggering do status when saving row rules."""

import unittest
from unittest.mock import MagicMock, patch

from video_bot.models import SheetRow
from video_bot.row_rules import RowRangeRule
from video_bot.sheets import auto_trigger_do_for_row_rules


def _row(row_number: int, status: str, **extra: str) -> SheetRow:
    return SheetRow(row_number=row_number, values={"status": status, **extra})


class RowRulesAutoDoTests(unittest.TestCase):
    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_sets_do_for_single_row_with_background(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status"]
        mock_get_rows.return_value = (headers, [_row(10, "pending")])
        rules = [
            RowRangeRule(
                from_row=10,
                batch_rows="10",
                background_video_id="bg1",
            ),
        ]

        result = auto_trigger_do_for_row_rules(rules, sheets=MagicMock())

        self.assertEqual(result["auto_do_rows"], [10])
        mock_update.assert_called_once()

    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_sets_do_for_all_batch_rows(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status"]
        mock_get_rows.return_value = (
            headers,
            [_row(70, "pending"), _row(601, "pending"), _row(805, "pending")],
        )
        rules = [
            RowRangeRule(
                from_row=70,
                batch_rows="70, 601, 805",
                thumbnail_file_id="thumb1",
            ),
        ]

        result = auto_trigger_do_for_row_rules(rules, sheets=MagicMock())

        self.assertEqual(result["auto_do_rows"], [70, 601, 805])
        self.assertEqual(mock_update.call_count, 3)

    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_skips_scheduled_rows_including_anchor(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status"]
        mock_get_rows.return_value = (
            headers,
            [
                _row(70, "scheduled", schedule_time="2026-05-22T14:30:00+00:00"),
                _row(601, "pending"),
            ],
        )
        rules = [
            RowRangeRule(
                from_row=70,
                batch_rows="70, 601",
                background_video_id="bg1",
            ),
        ]

        result = auto_trigger_do_for_row_rules(rules, sheets=MagicMock())

        self.assertEqual(result["auto_do_rows"], [601])
        mock_update.assert_called_once()

    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_loop_only_rule_does_not_trigger(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status"]
        mock_get_rows.return_value = (headers, [_row(10, "pending")])
        rules = [
            RowRangeRule(
                from_row=10,
                batch_rows="10",
                background_loop_count=3,
            ),
        ]

        result = auto_trigger_do_for_row_rules(rules, sheets=MagicMock())

        self.assertEqual(result["auto_do_rows"], [])
        mock_update.assert_not_called()

    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_skips_rows_already_do(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status"]
        mock_get_rows.return_value = (headers, [_row(10, "do")])
        rules = [
            RowRangeRule(
                from_row=10,
                batch_rows="10",
                background_video_id="bg1",
            ),
        ]

        result = auto_trigger_do_for_row_rules(rules, sheets=MagicMock())

        self.assertEqual(result["auto_do_rows"], [])
        mock_update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
