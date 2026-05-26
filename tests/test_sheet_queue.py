"""Tests for render queue selection (do and scheduled only, never pending)."""

import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from video_bot.models import SheetRow
from video_bot.sheets import (
    has_do_row,
    has_due_scheduled_row,
    reserve_next_do_row,
    reserve_next_pending_row,
)


def _row(row_number: int, status: str, **extra: str) -> SheetRow:
    values = {"status": status, **extra}
    return SheetRow(row_number=row_number, values=values)


class SheetQueueTests(unittest.TestCase):
    def test_has_do_row_true_when_do_present(self) -> None:
        rows = [_row(10, "do"), _row(11, "pending")]
        self.assertTrue(has_do_row(rows))

    def test_has_do_row_false_when_only_pending(self) -> None:
        rows = [_row(10, "pending")]
        self.assertFalse(has_do_row(rows))

    def test_has_due_scheduled_row_past_time(self) -> None:
        past = datetime(2020, 1, 1, 12, 0, tzinfo=timezone.utc)
        rows = [
            _row(10, "scheduled", schedule_time="2020-01-01T12:00:00+00:00"),
        ]
        self.assertTrue(
            has_due_scheduled_row(rows, now=datetime(2020, 1, 1, 13, 0, tzinfo=timezone.utc)),
        )

    def test_has_due_repeat_row_past_time(self) -> None:
        rows = [
            _row(10, "repeat", schedule_time="2020-01-01T12:00:00+00:00"),
        ]
        self.assertTrue(
            has_due_scheduled_row(rows, now=datetime(2020, 1, 1, 13, 0, tzinfo=timezone.utc)),
        )

    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_reserve_picks_due_repeat_before_do(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status", "schedule_time"]
        repeat_row = _row(5, "repeat", schedule_time="2020-01-01T10:00:00+00:00")
        do_row = _row(6, "do")
        mock_get_rows.return_value = (headers, [do_row, repeat_row])
        sheets = MagicMock()

        _, selected = reserve_next_pending_row(sheets)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.row_number, 5)
        mock_update.assert_called_once()

    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_reserve_picks_due_scheduled_before_do(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status", "schedule_time"]
        scheduled = _row(5, "scheduled", schedule_time="2020-01-01T10:00:00+00:00")
        do_row = _row(6, "do")
        mock_get_rows.return_value = (headers, [do_row, scheduled])
        sheets = MagicMock()

        _, selected = reserve_next_pending_row(sheets)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.row_number, 5)
        mock_update.assert_called_once()

    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_reserve_picks_do_when_no_due_scheduled(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status", "schedule_time"]
        do_row = _row(6, "do")
        pending = _row(7, "pending")
        mock_get_rows.return_value = (headers, [pending, do_row])
        sheets = MagicMock()

        _, selected = reserve_next_pending_row(sheets)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.row_number, 6)

    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_reserve_skips_pending_when_no_do_or_scheduled(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status"]
        pending = _row(7, "pending")
        mock_get_rows.return_value = (headers, [pending])
        sheets = MagicMock()

        _, selected = reserve_next_pending_row(sheets)

        self.assertIsNone(selected)
        mock_update.assert_not_called()

    @patch("video_bot.sheets.resolve_batch_anchor_row")
    def test_has_due_scheduled_member_resolves_to_anchor(
        self,
        mock_resolve: MagicMock,
    ) -> None:
        mock_resolve.return_value = 70
        rows = [
            _row(70, "pending"),
            _row(601, "scheduled", schedule_time="2020-01-01T10:00:00+00:00"),
        ]
        now = datetime(2020, 1, 1, 11, 0, tzinfo=timezone.utc)
        self.assertTrue(has_due_scheduled_row(rows, now=now))

    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_reserve_do_row_skips_repeat(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status", "schedule_time"]
        repeat_row = _row(5, "repeat", schedule_time="2020-01-01T10:00:00+00:00")
        do_row = _row(6, "do")
        mock_get_rows.return_value = (headers, [repeat_row, do_row])
        sheets = MagicMock()

        _, selected = reserve_next_do_row(sheets)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.row_number, 6)

    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_reserve_do_row_skips_scheduled(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status", "schedule_time"]
        scheduled = _row(5, "scheduled", schedule_time="2020-01-01T10:00:00+00:00")
        do_row = _row(6, "do")
        mock_get_rows.return_value = (headers, [scheduled, do_row])
        sheets = MagicMock()

        _, selected = reserve_next_do_row(sheets)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.row_number, 6)

    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_reserve_pending_still_picks_scheduled_first(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status", "schedule_time"]
        scheduled = _row(5, "scheduled", schedule_time="2020-01-01T10:00:00+00:00")
        do_row = _row(6, "do")
        mock_get_rows.return_value = (headers, [do_row, scheduled])
        sheets = MagicMock()

        _, selected = reserve_next_pending_row(sheets)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.row_number, 5)

    @patch("video_bot.sheets.resolve_batch_anchor_row")
    def test_has_do_row_when_only_batch_member_is_do(
        self,
        mock_resolve: MagicMock,
    ) -> None:
        mock_resolve.return_value = 70
        rows = [_row(70, "pending"), _row(601, "do")]
        self.assertTrue(has_do_row(rows))

    @patch("video_bot.sheets.resolve_batch_anchor_row")
    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_reserve_do_member_picks_anchor(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
        mock_resolve: MagicMock,
    ) -> None:
        mock_resolve.side_effect = lambda n: 70 if n == 601 else n
        headers = ["status"]
        anchor = _row(70, "pending")
        member = _row(601, "do")
        mock_get_rows.return_value = (headers, [anchor, member])
        sheets = MagicMock()

        _, selected = reserve_next_do_row(sheets)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.row_number, 70)
        mock_update.assert_called_once_with(
            sheets, headers, 70, "processing", "",
        )

    @patch("video_bot.sheets.resolve_batch_anchor_row")
    def test_has_do_row_false_when_anchor_repeat(
        self,
        mock_resolve: MagicMock,
    ) -> None:
        mock_resolve.return_value = 70
        rows = [_row(70, "repeat"), _row(601, "do")]
        self.assertFalse(has_do_row(rows))

    @patch("video_bot.sheets.resolve_batch_anchor_row")
    def test_has_do_row_false_when_anchor_scheduled(
        self,
        mock_resolve: MagicMock,
    ) -> None:
        mock_resolve.return_value = 70
        rows = [_row(70, "scheduled"), _row(601, "do")]
        self.assertFalse(has_do_row(rows))

    @patch("video_bot.sheets.resolve_batch_anchor_row")
    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_reserve_scheduled_member_picks_anchor(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
        mock_resolve: MagicMock,
    ) -> None:
        mock_resolve.side_effect = lambda n: 70 if n == 601 else n
        headers = ["status", "schedule_time"]
        anchor = _row(70, "pending")
        member = _row(601, "scheduled", schedule_time="2020-01-01T10:00:00+00:00")
        mock_get_rows.return_value = (headers, [anchor, member])
        sheets = MagicMock()

        _, selected = reserve_next_pending_row(sheets)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.row_number, 70)
        mock_update.assert_called_once_with(
            sheets, headers, 70, "processing", "",
        )

    @patch("video_bot.sheets.resolve_batch_anchor_row")
    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_reserve_deduplicates_multiple_scheduled_members(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
        mock_resolve: MagicMock,
    ) -> None:
        mock_resolve.return_value = 70
        headers = ["status", "schedule_time"]
        anchor = _row(70, "pending")
        member_a = _row(601, "scheduled", schedule_time="2020-01-01T12:00:00+00:00")
        member_b = _row(805, "scheduled", schedule_time="2020-01-01T10:00:00+00:00")
        mock_get_rows.return_value = (headers, [anchor, member_a, member_b])
        sheets = MagicMock()

        _, selected = reserve_next_pending_row(sheets)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.row_number, 70)
        mock_update.assert_called_once()

    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.get_sheet_rows")
    def test_reserve_anchor_scheduled_still_works(
        self,
        mock_get_rows: MagicMock,
        mock_update: MagicMock,
    ) -> None:
        headers = ["status", "schedule_time"]
        anchor = _row(70, "scheduled", schedule_time="2020-01-01T10:00:00+00:00")
        mock_get_rows.return_value = (headers, [anchor])
        sheets = MagicMock()

        _, selected = reserve_next_pending_row(sheets)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.row_number, 70)


if __name__ == "__main__":
    unittest.main()
