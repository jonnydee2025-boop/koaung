"""Tests for sheet cache and jobs listing memoization."""

import unittest
from unittest.mock import MagicMock, patch

from video_bot.api import job_listing
from video_bot.models import SheetRow
from video_bot import repeat_jobs as repeat_jobs_mod
from video_bot import sheet_cache


class SheetDataCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        sheet_cache.invalidate_sheet_cache()
        job_listing._jobs_memo = None
        repeat_jobs_mod._repeat_jobs_cache = None

    def tearDown(self) -> None:
        sheet_cache.invalidate_sheet_cache()
        job_listing._jobs_memo = None
        repeat_jobs_mod._repeat_jobs_cache = None

    def test_sheet_cache_reuses_rows_until_invalidated(self) -> None:
        rows = [SheetRow(2, {"status": "pending"})]
        mock_sheets = MagicMock()

        with patch(
            "video_bot.sheet_cache.build_sheets_service",
            return_value=mock_sheets,
        ), patch(
            "video_bot.sheet_cache.get_sheet_rows",
            return_value=(["status"], rows),
        ) as mock_get:
            first = sheet_cache.get_cached_sheet_rows()
            second = sheet_cache.get_cached_sheet_rows()

        self.assertEqual(first, second)
        mock_get.assert_called_once()

    def test_update_sheet_cell_invalidates_cache(self) -> None:
        rows = [SheetRow(2, {"status": "pending"})]
        mock_sheets = MagicMock()

        with patch(
            "video_bot.sheet_cache.build_sheets_service",
            return_value=mock_sheets,
        ), patch(
            "video_bot.sheet_cache.get_sheet_rows",
            return_value=(["status"], rows),
        ) as mock_get:
            sheet_cache.get_cached_sheet_rows()
            from video_bot.sheets import update_sheet_cell

            update_sheet_cell(mock_sheets, 2, 1, "processing")
            sheet_cache.get_cached_sheet_rows()

        self.assertEqual(mock_get.call_count, 2)
        self.assertGreater(sheet_cache.cache_generation(), 0)

    def test_all_jobs_sorted_reuses_memo_until_sheet_changes(self) -> None:
        rows = [SheetRow(2, {"status": "pending", "dhamma_title": "Talk"})]

        with patch(
            "video_bot.api.job_listing.get_cached_sheet_rows",
            return_value=(["status", "dhamma_title"], rows),
        ) as mock_rows, patch(
            "video_bot.api.job_listing.load_repeat_jobs",
            return_value={},
        ):
            first = job_listing.all_jobs_sorted()
            second = job_listing.all_jobs_sorted()

        self.assertEqual(first, second)
        mock_rows.assert_called_once()

    def test_load_repeat_jobs_reads_file_once_until_mtime_changes(self) -> None:
        payload = '{"jobs": {"5": {"anchor_row": 5, "repeat_type": "daily", "time": "07:00", "days_of_week": [], "timezone": "UTC", "thumbnails": [], "run_count": 0}}}'
        mock_path = MagicMock()
        mock_path.is_file.return_value = True
        mock_stat = MagicMock()
        mock_stat.st_mtime = 123.0
        mock_path.stat.return_value = mock_stat
        mock_path.read_text.return_value = payload

        with patch.object(repeat_jobs_mod, "REPEAT_JOBS_PATH", mock_path):
            first = repeat_jobs_mod.load_repeat_jobs()
            second = repeat_jobs_mod.load_repeat_jobs()

        self.assertIn(5, first)
        self.assertEqual(first, second)
        mock_path.read_text.assert_called_once()


if __name__ == "__main__":
    unittest.main()
