"""Tests for interval trigger settings."""

import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from video_bot.interval_triggers import (
    IntervalTrigger,
    mark_triggers_fired,
    next_trigger_at,
    triggers_due_now,
    validate_interval_triggers,
)


class IntervalTriggerDueTests(unittest.TestCase):
    def test_daily_due_at_matching_minute(self) -> None:
        trigger = IntervalTrigger(
            id="t1",
            name="Daily",
            enabled=True,
            schedule_type="daily",
            time="09:00",
            timezone="UTC",
        )
        now = datetime(2026, 6, 1, 9, 0, 30, tzinfo=timezone.utc)
        self.assertEqual(triggers_due_now([trigger], now=now), [trigger])

    def test_daily_not_due_other_minute(self) -> None:
        trigger = IntervalTrigger(
            id="t1",
            name="Daily",
            enabled=True,
            schedule_type="daily",
            time="09:00",
            timezone="UTC",
        )
        now = datetime(2026, 6, 1, 9, 1, tzinfo=timezone.utc)
        self.assertEqual(triggers_due_now([trigger], now=now), [])

    def test_weekly_due_on_selected_day(self) -> None:
        trigger = IntervalTrigger(
            id="t1",
            name="Weekly",
            enabled=True,
            schedule_type="weekly",
            time="14:30",
            days_of_week=[0],
            timezone="UTC",
        )
        monday = datetime(2026, 6, 1, 14, 30, tzinfo=timezone.utc)
        self.assertEqual(monday.weekday(), 0)
        self.assertEqual(triggers_due_now([trigger], now=monday), [trigger])

    def test_once_due_after_target_time(self) -> None:
        trigger = IntervalTrigger(
            id="t1",
            name="Once",
            enabled=True,
            schedule_type="once",
            once_at="2026-06-01T10:00:00+00:00",
            timezone="UTC",
        )
        now = datetime(2026, 6, 1, 10, 5, tzinfo=timezone.utc)
        self.assertEqual(triggers_due_now([trigger], now=now), [trigger])

    def test_not_due_if_already_fired_this_slot(self) -> None:
        trigger = IntervalTrigger(
            id="t1",
            name="Daily",
            enabled=True,
            schedule_type="daily",
            time="09:00",
            timezone="UTC",
            last_fired_at="2026-06-01T09:00",
        )
        now = datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc)
        self.assertEqual(triggers_due_now([trigger], now=now), [])

    @patch("video_bot.interval_triggers.save_interval_triggers")
    @patch("video_bot.interval_triggers.load_interval_triggers")
    def test_mark_triggers_fired_disables_once(
        self,
        mock_load: MagicMock,
        mock_save: MagicMock,
    ) -> None:
        trigger = IntervalTrigger(
            id="once1",
            name="Once",
            enabled=True,
            schedule_type="once",
            once_at="2026-06-01T10:00:00+00:00",
            timezone="UTC",
        )
        mock_load.return_value = [trigger]
        now = datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc)
        mark_triggers_fired(["once1"], now=now)
        self.assertFalse(trigger.enabled)
        self.assertIsNotNone(trigger.last_fired_at)
        mock_save.assert_called_once()

    def test_next_trigger_at_daily(self) -> None:
        trigger = IntervalTrigger(
            id="t1",
            name="Daily",
            enabled=True,
            schedule_type="daily",
            time="18:30",
            timezone="UTC",
        )
        now = datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc)
        nxt = next_trigger_at([trigger], now=now)
        self.assertIsNotNone(nxt)
        self.assertIn("18:30", nxt)


class IntervalTriggerValidationTests(unittest.TestCase):
    def test_weekly_requires_weekday(self) -> None:
        trigger = IntervalTrigger(
            id="t1",
            name="Weekly",
            enabled=True,
            schedule_type="weekly",
            time="09:00",
            days_of_week=[],
            timezone="UTC",
        )
        with self.assertRaises(ValueError):
            validate_interval_triggers([trigger])


if __name__ == "__main__":
    unittest.main()
