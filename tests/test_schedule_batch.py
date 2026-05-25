"""Tests for batch-aware scheduling (anchor row holds schedule)."""

import unittest
from unittest.mock import MagicMock, patch

from video_bot.models import SheetRow
from video_bot.row_rules import RowRangeRule
from video_bot.sheets import schedule_sheet_row


def _row(row_number: int, status: str, **extra: str) -> SheetRow:
    return SheetRow(row_number=row_number, values={"status": status, **extra})


class ScheduleBatchTests(unittest.TestCase):
    @patch("video_bot.sheets.build_google_services")
    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.update_schedule_time")
    @patch("video_bot.sheets.get_sheet_rows")
    @patch("video_bot.sheets.get_batch_rule_for_anchor")
    @patch("video_bot.sheets.resolve_batch_anchor_row")
    def test_scheduling_member_redirects_to_anchor(
        self,
        mock_resolve: MagicMock,
        mock_batch_rule: MagicMock,
        mock_get_rows: MagicMock,
        mock_set_schedule: MagicMock,
        mock_update: MagicMock,
        mock_build: MagicMock,
    ) -> None:
        mock_resolve.return_value = 70
        mock_batch_rule.return_value = (
            RowRangeRule(from_row=70, batch_rows="70, 601, 805"),
            [70, 601, 805],
        )
        headers = ["status", "schedule_time"]
        mock_get_rows.return_value = (
            headers,
            [_row(70, "pending"), _row(601, "pending"), _row(805, "pending")],
        )
        mock_build.return_value = (MagicMock(), None)

        result = schedule_sheet_row(601, "2026-12-01T10:00:00+00:00")

        self.assertEqual(result["row"], 70)
        self.assertEqual(result["requested_row"], 601)
        self.assertTrue(result["redirected_to_anchor"])
        mock_set_schedule.assert_called_once()
        self.assertEqual(mock_set_schedule.call_args[0][2], 70)
        mock_update.assert_called_once()
        self.assertEqual(mock_update.call_args[0][2], 70)

    @patch("video_bot.sheets.build_google_services")
    @patch("video_bot.sheets.clear_schedule_time")
    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.update_schedule_time")
    @patch("video_bot.sheets.get_sheet_rows")
    @patch("video_bot.sheets.get_batch_rule_for_anchor")
    @patch("video_bot.sheets.resolve_batch_anchor_row")
    def test_scheduling_clears_member_schedules(
        self,
        mock_resolve: MagicMock,
        mock_batch_rule: MagicMock,
        mock_get_rows: MagicMock,
        mock_set_schedule: MagicMock,
        mock_update: MagicMock,
        mock_clear: MagicMock,
        mock_build: MagicMock,
    ) -> None:
        mock_resolve.return_value = 70
        mock_batch_rule.return_value = (
            RowRangeRule(from_row=70, batch_rows="70, 601"),
            [70, 601],
        )
        headers = ["status", "schedule_time"]
        mock_get_rows.return_value = (
            headers,
            [
                _row(70, "pending"),
                _row(601, "scheduled", schedule_time="2026-11-01T10:00:00+00:00"),
            ],
        )
        mock_build.return_value = (MagicMock(), None)

        schedule_sheet_row(70, "2026-12-01T10:00:00+00:00")

        mock_clear.assert_called_once()
        self.assertEqual(mock_clear.call_args[0][2], 601)
        self.assertEqual(mock_update.call_count, 2)


if __name__ == "__main__":
    unittest.main()
