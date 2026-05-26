"""Tests for per-anchor repeat schedules and conflict detection."""

import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from video_bot.models import SheetRow
from video_bot.repeat_jobs import (
    RepeatJob,
    compute_next_run,
    local_time_matches_repeat,
    repeat_jobs_overlap,
    validate_repeat_job,
)
from video_bot.sheets import (
    find_time_slot_conflict_once,
    find_time_slot_conflict_repeat,
    reschedule_repeat_anchor_after_upload,
    schedule_job_row,
)


def _row(row_number: int, status: str, **extra: str) -> SheetRow:
    return SheetRow(row_number=row_number, values={"status": status, **extra})


class ComputeNextRunTests(unittest.TestCase):
    def test_daily_next_same_day(self) -> None:
        job = RepeatJob(anchor_row=1, repeat_type="daily", time="09:00", timezone="UTC")
        after = datetime(2026, 6, 1, 8, 0, tzinfo=timezone.utc)
        next_run = compute_next_run(job, after=after)
        self.assertEqual(next_run, datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc))

    def test_daily_next_day_when_time_passed(self) -> None:
        job = RepeatJob(anchor_row=1, repeat_type="daily", time="09:00", timezone="UTC")
        after = datetime(2026, 6, 1, 9, 30, tzinfo=timezone.utc)
        next_run = compute_next_run(job, after=after)
        self.assertEqual(next_run, datetime(2026, 6, 2, 9, 0, tzinfo=timezone.utc))

    def test_weekly_skips_non_selected_days(self) -> None:
        job = RepeatJob(
            anchor_row=1,
            repeat_type="weekly",
            time="07:00",
            days_of_week=[0],
            timezone="UTC",
        )
        # 2026-06-01 is Monday (weekday 0); after Monday 08:00 → next Monday
        after = datetime(2026, 6, 1, 8, 0, tzinfo=timezone.utc)
        next_run = compute_next_run(job, after=after)
        self.assertEqual(next_run, datetime(2026, 6, 8, 7, 0, tzinfo=timezone.utc))

    def test_timezone_yangon(self) -> None:
        job = RepeatJob(
            anchor_row=1,
            repeat_type="daily",
            time="07:00",
            timezone="Asia/Yangon",
        )
        # 07:00 Yangon = 00:30 UTC
        after = datetime(2026, 6, 1, 0, 0, tzinfo=timezone.utc)
        next_run = compute_next_run(job, after=after)
        self.assertEqual(next_run, datetime(2026, 6, 1, 0, 30, tzinfo=timezone.utc))

    def test_weekly_requires_days(self) -> None:
        job = RepeatJob(anchor_row=1, repeat_type="weekly", time="07:00", days_of_week=[])
        with self.assertRaises(ValueError):
            validate_repeat_job(job)


class RepeatOverlapTests(unittest.TestCase):
    def test_daily_overlaps_weekly_same_time(self) -> None:
        daily = RepeatJob(anchor_row=1, repeat_type="daily", time="07:00", timezone="UTC")
        weekly = RepeatJob(
            anchor_row=2,
            repeat_type="weekly",
            time="07:00",
            days_of_week=[0],
            timezone="UTC",
        )
        self.assertTrue(repeat_jobs_overlap(daily, weekly))

    def test_weekly_no_overlap_different_days(self) -> None:
        a = RepeatJob(
            anchor_row=1,
            repeat_type="weekly",
            time="07:00",
            days_of_week=[0],
            timezone="UTC",
        )
        b = RepeatJob(
            anchor_row=2,
            repeat_type="weekly",
            time="07:00",
            days_of_week=[2],
            timezone="UTC",
        )
        self.assertFalse(repeat_jobs_overlap(a, b))

    def test_local_time_matches_repeat_daily(self) -> None:
        job = RepeatJob(anchor_row=1, repeat_type="daily", time="07:00", timezone="Asia/Yangon")
        moment = datetime(2026, 6, 1, 0, 30, tzinfo=timezone.utc)
        self.assertTrue(local_time_matches_repeat(job, moment))


class TimeSlotConflictTests(unittest.TestCase):
    @patch("video_bot.sheets.load_repeat_jobs")
    def test_once_conflicts_with_repeat_slot(self, mock_load: MagicMock) -> None:
        mock_load.return_value = {
            99: RepeatJob(anchor_row=99, repeat_type="daily", time="07:00", timezone="Asia/Yangon"),
        }
        schedule_at = datetime(2026, 6, 1, 0, 30, tzinfo=timezone.utc)
        message = find_time_slot_conflict_once([], schedule_at)
        self.assertIsNotNone(message)
        self.assertIn("row #99", message)

    @patch("video_bot.sheets.load_repeat_jobs")
    def test_repeat_conflicts_with_other_repeat(self, mock_load: MagicMock) -> None:
        mock_load.return_value = {
            50: RepeatJob(
                anchor_row=50,
                repeat_type="daily",
                time="07:00",
                timezone="UTC",
            ),
        }
        job = RepeatJob(anchor_row=10, repeat_type="daily", time="07:00", timezone="UTC")
        message = find_time_slot_conflict_repeat([], job, exclude_anchor=10)
        self.assertIsNotNone(message)
        self.assertIn("row #50", message)

    @patch("video_bot.sheets.load_repeat_jobs")
    def test_repeat_conflicts_with_scheduled_once(self, mock_load: MagicMock) -> None:
        mock_load.return_value = {}
        job = RepeatJob(anchor_row=10, repeat_type="daily", time="07:00", timezone="UTC")
        rows = [
            _row(20, "scheduled", schedule_time="2026-06-01T07:00:00+00:00"),
        ]
        message = find_time_slot_conflict_repeat(rows, job, exclude_anchor=10)
        self.assertIsNotNone(message)
        self.assertIn("row #20", message)


class ScheduleRepeatBatchTests(unittest.TestCase):
    @patch("video_bot.sheets.build_google_services")
    @patch("video_bot.sheets.save_repeat_job")
    @patch("video_bot.sheets.compute_next_run")
    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.update_schedule_time")
    @patch("video_bot.sheets.get_sheet_rows")
    @patch("video_bot.sheets.get_batch_rule_for_anchor")
    @patch("video_bot.sheets.resolve_batch_anchor_row")
    def test_repeat_on_member_redirects_to_anchor(
        self,
        mock_resolve: MagicMock,
        mock_batch_rule: MagicMock,
        mock_get_rows: MagicMock,
        mock_set_schedule: MagicMock,
        mock_update: MagicMock,
        mock_compute: MagicMock,
        mock_save: MagicMock,
        mock_build: MagicMock,
    ) -> None:
        from video_bot.row_rules import RowRangeRule

        mock_resolve.return_value = 70
        mock_batch_rule.return_value = (
            RowRangeRule(from_row=70, batch_rows="70, 601, 805"),
            [70, 601, 805],
        )
        next_run = datetime(2026, 12, 2, 7, 0, tzinfo=timezone.utc)
        mock_compute.return_value = next_run
        headers = ["status", "schedule_time"]
        mock_get_rows.return_value = (
            headers,
            [_row(70, "pending"), _row(601, "pending"), _row(805, "pending")],
        )
        mock_build.return_value = (MagicMock(), None)

        with patch("video_bot.sheets.find_time_slot_conflict_repeat", return_value=None):
            result = schedule_job_row(
                601,
                mode="repeat",
                repeat_type="daily",
                repeat_time="07:00",
                timezone="UTC",
            )

        self.assertEqual(result["row"], 70)
        self.assertEqual(result["requested_row"], 601)
        self.assertTrue(result["redirected_to_anchor"])
        self.assertEqual(result["status"], "repeat")
        mock_save.assert_called_once()
        mock_update.assert_called_once()
        self.assertEqual(mock_update.call_args[0][2], 70)
        self.assertEqual(mock_update.call_args[0][3], "repeat")


class RescheduleAfterUploadTests(unittest.TestCase):
    @patch("video_bot.sheets.compute_next_run")
    @patch("video_bot.sheets.get_repeat_job")
    @patch("video_bot.sheets.update_task_status")
    @patch("video_bot.sheets.update_schedule_time")
    def test_reschedule_repeat_anchor_after_upload(
        self,
        mock_set_schedule: MagicMock,
        mock_update: MagicMock,
        mock_get_job: MagicMock,
        mock_compute: MagicMock,
    ) -> None:
        job = RepeatJob(anchor_row=70, repeat_type="daily", time="07:00", timezone="UTC")
        mock_get_job.return_value = job
        next_run = datetime(2026, 12, 3, 7, 0, tzinfo=timezone.utc)
        mock_compute.return_value = next_run
        sheets = MagicMock()
        headers = ["status", "schedule_time"]

        reschedule_repeat_anchor_after_upload(sheets, headers, 70, "Uploaded.")

        mock_set_schedule.assert_called_once_with(sheets, headers, 70, next_run)
        mock_update.assert_called_once()
        self.assertEqual(mock_update.call_args[0][3], "repeat")


if __name__ == "__main__":
    unittest.main()
