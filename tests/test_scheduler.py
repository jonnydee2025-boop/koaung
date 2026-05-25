"""Tests for scheduler interval trigger firing."""

import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from video_bot.interval_triggers import IntervalTrigger
from video_bot.scheduler import try_fire_interval_triggers


class SchedulerIntervalTests(unittest.IsolatedAsyncioTestCase):
    @patch("video_bot.scheduler.mark_triggers_fired")
    @patch("video_bot.scheduler.try_trigger_do_render", new_callable=AsyncMock)
    @patch("video_bot.scheduler.triggers_due_now")
    @patch("video_bot.scheduler.load_interval_triggers")
    async def test_mark_fired_only_when_render_queued(
        self,
        mock_load: MagicMock,
        mock_due: MagicMock,
        mock_do_render: AsyncMock,
        mock_mark: MagicMock,
    ) -> None:
        trigger = IntervalTrigger(
            id="t1",
            name="Daily",
            enabled=True,
            schedule_type="daily",
            time="09:00",
            timezone="UTC",
        )
        mock_load.return_value = [trigger]
        mock_due.return_value = [trigger]
        mock_do_render.return_value = True

        result = await try_fire_interval_triggers()

        self.assertTrue(result)
        mock_mark.assert_called_once_with(["t1"])

    @patch("video_bot.scheduler.mark_triggers_fired")
    @patch("video_bot.scheduler.try_trigger_do_render", new_callable=AsyncMock)
    @patch("video_bot.scheduler.triggers_due_now")
    @patch("video_bot.scheduler.load_interval_triggers")
    async def test_does_not_mark_fired_when_render_not_queued(
        self,
        mock_load: MagicMock,
        mock_due: MagicMock,
        mock_do_render: AsyncMock,
        mock_mark: MagicMock,
    ) -> None:
        trigger = IntervalTrigger(
            id="t1",
            name="Daily",
            enabled=True,
            schedule_type="daily",
            time="09:00",
            timezone="UTC",
        )
        mock_load.return_value = [trigger]
        mock_due.return_value = [trigger]
        mock_do_render.return_value = False

        result = await try_fire_interval_triggers()

        self.assertFalse(result)
        mock_mark.assert_not_called()


if __name__ == "__main__":
    unittest.main()
