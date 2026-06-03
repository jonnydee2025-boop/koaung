import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from video_bot.models import NoPendingRows
from video_bot.render_chain import run_render_chain


class _FakeLock:
    async def __aenter__(self) -> "_FakeLock":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None


class RenderChainTests(unittest.IsolatedAsyncioTestCase):
    async def test_chains_until_queue_empty(self) -> None:
        results = [
            {"title": "First", "video_id": "v1"},
            {"title": "Second", "video_id": "v2"},
        ]

        with patch("video_bot.render_chain.run_render_job", side_effect=results) as mock_run, patch(
            "video_bot.render_chain.has_next_render_row", side_effect=[True, False]
        ) as mock_has_next, patch(
            "video_bot.render_chain.notify_render_success", new_callable=AsyncMock
        ) as mock_notify, patch(
            "video_bot.render_chain.AUTO_QUEUE_NEXT_JOB", True
        ), patch("video_bot.render_chain.task_lock", _FakeLock()):
            await run_render_chain(lambda *_args, **_kwargs: None, do_only=True)

        self.assertEqual(mock_run.call_count, 2)
        self.assertIsNone(mock_run.call_args_list[0].kwargs["row_number"])
        self.assertIsNone(mock_run.call_args_list[1].kwargs["row_number"])
        self.assertEqual(mock_has_next.call_count, 2)
        self.assertEqual(mock_notify.await_count, 2)

    async def test_single_row_retry_does_not_chain(self) -> None:
        with patch(
            "video_bot.render_chain.run_render_job",
            return_value={"title": "Retry", "video_id": "v9"},
        ) as mock_run, patch(
            "video_bot.render_chain.has_next_render_row", return_value=True
        ) as mock_has_next, patch(
            "video_bot.render_chain.notify_render_success", new_callable=AsyncMock
        ), patch("video_bot.render_chain.AUTO_QUEUE_NEXT_JOB", True), patch(
            "video_bot.render_chain.task_lock", _FakeLock()
        ):
            await run_render_chain(
                lambda *_args, **_kwargs: None,
                row_number=42,
                do_only=False,
            )

        mock_run.assert_called_once()
        mock_has_next.assert_not_called()

    async def test_stops_chain_on_failure(self) -> None:
        with patch(
            "video_bot.render_chain.run_render_job",
            side_effect=RuntimeError("encode failed"),
        ) as mock_run, patch(
            "video_bot.render_chain.has_next_render_row", return_value=True
        ), patch(
            "video_bot.render_chain.notify_render_failure", new_callable=AsyncMock
        ) as mock_failure, patch(
            "video_bot.render_chain.AUTO_QUEUE_NEXT_JOB", True
        ), patch("video_bot.render_chain.task_lock", _FakeLock()):
            await run_render_chain(lambda *_args, **_kwargs: None, do_only=True)

        mock_run.assert_called_once()
        mock_failure.assert_awaited_once()

    async def test_no_pending_rows_on_first_job(self) -> None:
        with patch(
            "video_bot.render_chain.run_render_job",
            side_effect=NoPendingRows(),
        ), patch(
            "video_bot.render_chain.notify_no_pending_rows", new_callable=AsyncMock
        ) as mock_empty, patch(
            "video_bot.render_chain.AUTO_QUEUE_NEXT_JOB", True
        ), patch("video_bot.render_chain.task_lock", _FakeLock()):
            await run_render_chain(lambda *_args, **_kwargs: None, do_only=True)

        mock_empty.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
