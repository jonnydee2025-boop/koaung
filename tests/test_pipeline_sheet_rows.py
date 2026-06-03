import unittest
from unittest.mock import MagicMock, patch

from video_bot.models import SheetRow
from video_bot.jobs.pipeline import process_reserved_row


def _row(row_number: int, **values: str) -> SheetRow:
    base = {
        "status": "processing",
        "dhamma_title": "Talk",
        "mp3_url": "https://example.com/a.mp3",
        "monk": "U Test",
    }
    base.update(values)
    return SheetRow(row_number=row_number, values=base)


class PipelineSheetRowsTests(unittest.TestCase):
    @patch("video_bot.jobs.pipeline.ENABLE_AUDIO_ENHANCE", False)
    @patch("video_bot.jobs.pipeline.upload_video_to_youtube", return_value="vid1")
    @patch("video_bot.jobs.pipeline.finalize_video_privacy", return_value=("private", "no thumbnail"))
    @patch("video_bot.jobs.pipeline.generate_youtube_metadata", return_value=None)
    @patch("video_bot.jobs.pipeline.prepare_row_thumbnail", return_value=None)
    @patch("video_bot.jobs.pipeline.prepare_background_video", return_value="bg")
    @patch("video_bot.jobs.pipeline.render_video")
    @patch("video_bot.jobs.pipeline.download_file")
    @patch("video_bot.jobs.pipeline.update_task_status")
    def test_accepts_preloaded_sheet_rows(
        self,
        mock_update: MagicMock,
        *_mocks: MagicMock,
    ) -> None:
        anchor = _row(70)
        all_rows = [anchor]
        headers = list(anchor.values.keys())

        result = process_reserved_row(
            MagicMock(),
            MagicMock(),
            headers,
            anchor,
            all_rows=all_rows,
        )

        self.assertEqual(result["video_id"], "vid1")
        mock_update.assert_called()


if __name__ == "__main__":
    unittest.main()
