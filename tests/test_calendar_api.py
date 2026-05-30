"""Tests for calendar event helpers."""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from video_bot.api.calendar import build_calendar_events, month_range
from video_bot.repeat_jobs import RepeatJob, compute_next_run


class MonthRangeTests(unittest.TestCase):
    def test_month_range_june(self) -> None:
        start, end = month_range(2026, 6)
        self.assertEqual(start, datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2026, 6, 30, 23, 59, 59, tzinfo=timezone.utc))


class BuildCalendarEventsTests(unittest.TestCase):
    @patch("video_bot.api.calendar.load_repeat_jobs")
    @patch("video_bot.api.calendar.all_jobs_sorted")
    def test_scheduled_job_in_month(self, mock_jobs, mock_load_repeat) -> None:
        mock_load_repeat.return_value = {}
        mock_jobs.return_value = [
            {
                "row": 10,
                "title": "Morning Dhamma",
                "status": "scheduled",
                "monk": "U Vimala",
                "schedule_time": "2026-06-15T07:00:00+00:00",
            }
        ]
        events = build_calendar_events(2026, 6)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["kind"], "scheduled")
        self.assertEqual(events[0]["row"], 10)

    @patch("video_bot.api.calendar.load_repeat_jobs")
    @patch("video_bot.api.calendar.all_jobs_sorted")
    def test_repeat_job_expanded_in_month(
        self,
        mock_jobs,
        mock_load_repeat,
    ) -> None:
        job = RepeatJob(anchor_row=20, repeat_type="daily", time="07:00", timezone="UTC")
        mock_load_repeat.return_value = {20: job}
        mock_jobs.return_value = [
            {
                "row": 20,
                "title": "Daily talk",
                "status": "repeat",
                "monk": "U Pandita",
                "schedule_time": "",
            }
        ]
        events = build_calendar_events(2026, 6)
        self.assertGreaterEqual(len(events), 28)
        self.assertTrue(all(event["kind"] == "repeat" for event in events))
        self.assertEqual(events[0]["row"], 20)

    @patch("video_bot.api.calendar.load_repeat_jobs")
    @patch("video_bot.api.calendar.all_jobs_sorted")
    def test_repeat_from_json_even_when_sheet_status_pending(
        self,
        mock_jobs,
        mock_load_repeat,
    ) -> None:
        job = RepeatJob(anchor_row=20, repeat_type="daily", time="07:00", timezone="UTC")
        mock_load_repeat.return_value = {20: job}
        mock_jobs.return_value = [
            {
                "row": 20,
                "title": "Daily talk",
                "status": "pending",
                "monk": "U Pandita",
                "schedule_time": "",
            }
        ]
        events = build_calendar_events(2026, 6)
        self.assertGreaterEqual(len(events), 28)
        self.assertTrue(all(event["kind"] == "repeat" for event in events))

    @patch("video_bot.api.calendar.load_repeat_jobs")
    @patch("video_bot.api.calendar.all_jobs_sorted")
    def test_repeat_fallback_from_schedule_time_without_json(
        self,
        mock_jobs,
        mock_load_repeat,
    ) -> None:
        mock_load_repeat.return_value = {}
        mock_jobs.return_value = [
            {
                "row": 30,
                "title": "Orphan repeat",
                "status": "repeat",
                "monk": "",
                "schedule_time": "2026-06-12T07:00:00+00:00",
            }
        ]
        events = build_calendar_events(2026, 6)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["kind"], "repeat")
        self.assertEqual(events[0]["row"], 30)

    @patch("video_bot.api.calendar.datetime")
    @patch("video_bot.api.calendar.load_repeat_jobs")
    @patch("video_bot.api.calendar.all_jobs_sorted")
    def test_do_job_on_today_when_month_includes_today(
        self,
        mock_jobs,
        mock_load_repeat,
        mock_datetime,
    ) -> None:
        mock_load_repeat.return_value = {}
        fixed_today = datetime(2026, 6, 15, tzinfo=timezone.utc)
        mock_datetime.now.return_value = fixed_today
        mock_datetime.side_effect = lambda *args, **kw: datetime(*args, **kw)
        mock_jobs.return_value = [
            {
                "row": 5,
                "title": "Urgent edit",
                "status": "do",
                "monk": "U Vimala",
                "schedule_time": "",
            }
        ]
        events = build_calendar_events(2026, 6)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["kind"], "do")
        self.assertEqual(events[0]["row"], 5)
        self.assertEqual(events[0]["title"], "Urgent edit")
        self.assertEqual(events[0]["status"], "do")
        at = datetime.fromisoformat(events[0]["at"])
        self.assertEqual(at.date(), fixed_today.date())
        self.assertEqual(at.hour, 12)
        self.assertEqual(at.minute, 5)

    @patch("video_bot.api.calendar.datetime")
    @patch("video_bot.api.calendar.load_repeat_jobs")
    @patch("video_bot.api.calendar.all_jobs_sorted")
    def test_do_job_not_in_other_month(
        self,
        mock_jobs,
        mock_load_repeat,
        mock_datetime,
    ) -> None:
        mock_load_repeat.return_value = {}
        fixed_today = datetime(2026, 6, 15, tzinfo=timezone.utc)
        mock_datetime.now.return_value = fixed_today
        mock_datetime.side_effect = lambda *args, **kw: datetime(*args, **kw)
        mock_jobs.return_value = [
            {
                "row": 5,
                "title": "Urgent edit",
                "status": "do",
                "monk": "",
                "schedule_time": "",
            }
        ]
        past_events = build_calendar_events(2026, 5)
        future_events = build_calendar_events(2026, 7)
        self.assertEqual(past_events, [])
        self.assertEqual(future_events, [])


class RepeatExpansionConsistencyTests(unittest.TestCase):
    def test_repeat_expansion_matches_compute_next_run(self) -> None:
        job = RepeatJob(
            anchor_row=1,
            repeat_type="weekly",
            time="07:00",
            days_of_week=[0, 3],
            timezone="UTC",
        )
        start = datetime(2026, 6, 1, 0, 0, tzinfo=timezone.utc)
        end = datetime(2026, 6, 30, 23, 59, 59, tzinfo=timezone.utc)
        cursor = start
        expected: list[datetime] = []
        for _ in range(20):
            nxt = compute_next_run(job, after=cursor)
            if nxt > end:
                break
            expected.append(nxt)
            cursor = nxt

        with patch("video_bot.api.calendar.load_repeat_jobs", return_value={1: job}):
            with patch(
                "video_bot.api.calendar.all_jobs_sorted",
                return_value=[
                    {
                        "row": 1,
                        "title": "Weekly",
                        "status": "repeat",
                        "monk": "",
                        "schedule_time": "",
                    }
                ],
            ):
                events = build_calendar_events(2026, 6)
        actual = [datetime.fromisoformat(event["at"]) for event in events if event["kind"] == "repeat"]
        self.assertEqual(actual, expected)


if __name__ == "__main__":
    unittest.main()
