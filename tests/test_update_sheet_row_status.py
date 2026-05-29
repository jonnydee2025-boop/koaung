"""Tests for admin status updates clearing schedule/repeat/logs."""

import unittest
from unittest.mock import MagicMock, patch

from video_bot.models import SheetRow
from video_bot.sheets import update_sheet_row_status


def _row(row_number: int, status: str, **extra: str) -> SheetRow:
    return SheetRow(row_number=row_number, values={"status": status, **extra})


class UpdateSheetRowStatusTests(unittest.TestCase):
    @patch("video_bot.sheets.build_google_services")
    @patch("video_bot.sheets.clear_row_logs")
    @patch("video_bot.sheets.delete_repeat_job")
    @patch("video_bot.sheets.clear_schedule_time")
    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets._get_sheet_row_or_raise")
    def test_pending_clears_schedule_repeat_and_logs(
        self,
        mock_get_row: MagicMock,
        mock_update: MagicMock,
        mock_clear_schedule: MagicMock,
        mock_delete_repeat: MagicMock,
        mock_clear_logs: MagicMock,
        mock_build: MagicMock,
    ) -> None:
        headers = ["status", "Schedule_Time", "logs"]
        target = _row(
            13656,
            "failed",
            Schedule_Time="2026-05-25T20:49:00+00:00",
            logs="render failed",
        )
        mock_get_row.return_value = (headers, target)
        mock_build.return_value = (MagicMock(), None)

        result = update_sheet_row_status(13656, "pending")

        self.assertEqual(result["status"], "pending")
        self.assertEqual(result["previous_status"], "failed")
        mock_clear_schedule.assert_called_once()
        mock_delete_repeat.assert_called_once_with(13656)
        mock_clear_logs.assert_called_once()
        mock_update.assert_called_once()

    @patch("video_bot.sheets.build_google_services")
    @patch("video_bot.sheets.clear_row_logs")
    @patch("video_bot.sheets.delete_repeat_job")
    @patch("video_bot.sheets.clear_schedule_time")
    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets._get_sheet_row_or_raise")
    def test_do_does_not_clear_logs(
        self,
        mock_get_row: MagicMock,
        mock_update: MagicMock,
        mock_clear_schedule: MagicMock,
        mock_delete_repeat: MagicMock,
        mock_clear_logs: MagicMock,
        mock_build: MagicMock,
    ) -> None:
        headers = ["status", "logs"]
        target = _row(10, "failed", logs="still here")
        mock_get_row.return_value = (headers, target)
        mock_build.return_value = (MagicMock(), None)

        update_sheet_row_status(10, "do")

        mock_clear_logs.assert_not_called()
        mock_clear_schedule.assert_not_called()
        mock_delete_repeat.assert_not_called()


if __name__ == "__main__":
    unittest.main()
