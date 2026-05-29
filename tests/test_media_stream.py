"""Tests for remote audio streaming helpers."""

import unittest
from unittest.mock import MagicMock, patch

from video_bot.media import stream_remote_file


class StreamRemoteFileTests(unittest.TestCase):
    @patch("video_bot.media._remote_get_response")
    @patch("video_bot.media.google_drive_direct_url")
    def test_forwards_range_header(self, mock_resolve: MagicMock, mock_get: MagicMock) -> None:
        mock_resolve.return_value = "https://example.com/file.mp3"
        response = MagicMock()
        response.status_code = 206
        response.headers = {
            "Content-Length": "1000",
            "Content-Range": "bytes 0-999/5000",
            "Content-Type": "audio/mpeg",
        }
        response.iter_content.return_value = [b"abc"]
        mock_get.return_value = response

        status, headers, chunks = stream_remote_file(
            "https://drive.google.com/file/d/abc/view",
            range_header="bytes=0-999",
        )

        self.assertEqual(status, 206)
        self.assertEqual(headers["Accept-Ranges"], "bytes")
        self.assertEqual(headers["Content-Range"], "bytes 0-999/5000")
        self.assertEqual(list(chunks), [b"abc"])
        mock_get.assert_called_once()
        passed_headers = mock_get.call_args.kwargs.get("request_headers", {})
        self.assertEqual(passed_headers.get("Range"), "bytes=0-999")


if __name__ == "__main__":
    unittest.main()
