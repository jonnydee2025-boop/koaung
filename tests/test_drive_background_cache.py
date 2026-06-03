import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from video_bot import drive


class DriveBackgroundCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.cache_root = Path(self.temp_dir.name) / "cache"
        self.cache_root.mkdir()
        self.destination = Path(self.temp_dir.name) / "workdir" / "background.mp4"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_background_cache_path_uses_file_extension(self) -> None:
        with patch.object(drive, "DRIVE_BACKGROUND_CACHE_DIR", self.cache_root):
            path = drive.background_cache_path("file123", "loop.mkv")
        self.assertEqual(path, self.cache_root / "file123.mkv")

    def test_cache_hit_skips_drive_download(self) -> None:
        cache_file = self.cache_root / "abc123.mp4"
        cache_file.write_bytes(b"cached-background-bytes")
        drive_calls: list[str] = []

        class FakeDrive:
            def files(self) -> "FakeDrive":
                return self

            def get_media(self, **kwargs) -> "FakeDrive":
                drive_calls.append(kwargs["fileId"])
                return self

        with patch.object(drive, "DRIVE_BACKGROUND_CACHE_DIR", self.cache_root), patch.object(
            drive, "ENABLE_DRIVE_BACKGROUND_CACHE", True
        ), patch.object(drive, "download_drive_file") as mock_download:
            label = drive.copy_or_download_background_video(
                FakeDrive(),
                "abc123",
                self.destination,
                file_name="night_loop.mp4",
                label="Google Drive (row 70): night_loop.mp4",
            )

        mock_download.assert_not_called()
        self.assertEqual(self.destination.read_bytes(), b"cached-background-bytes")
        self.assertIn("(cached)", label)

    def test_cache_miss_downloads_once_then_reuses(self) -> None:
        downloaded: list[tuple[str, Path]] = []

        def fake_download(_drive: object, file_id: str, destination: Path) -> None:
            downloaded.append((file_id, destination))
            destination.write_bytes(b"fresh-background")

        class FakeDrive:
            pass

        with patch.object(drive, "DRIVE_BACKGROUND_CACHE_DIR", self.cache_root), patch.object(
            drive, "ENABLE_DRIVE_BACKGROUND_CACHE", True
        ), patch.object(drive, "download_drive_file", side_effect=fake_download):
            first = drive.copy_or_download_background_video(
                FakeDrive(),
                "xyz789",
                self.destination,
                file_name="forest.mp4",
                label="Google Drive: forest.mp4",
            )
            second_dest = Path(self.temp_dir.name) / "workdir2" / "background.mp4"
            second = drive.copy_or_download_background_video(
                FakeDrive(),
                "xyz789",
                second_dest,
                file_name="forest.mp4",
                label="Google Drive: forest.mp4",
            )

        self.assertEqual(len(downloaded), 1)
        self.assertNotIn("(cached)", first)
        self.assertIn("(cached)", second)
        self.assertEqual((self.cache_root / "xyz789.mp4").read_bytes(), b"fresh-background")
        self.assertEqual(second_dest.read_bytes(), b"fresh-background")

    def test_cache_disabled_downloads_directly(self) -> None:
        downloaded: list[tuple[str, Path]] = []

        def fake_download(_drive: object, file_id: str, destination: Path) -> None:
            destination.parent.mkdir(parents=True, exist_ok=True)
            downloaded.append((file_id, destination))
            destination.write_bytes(b"direct")

        with patch.object(drive, "ENABLE_DRIVE_BACKGROUND_CACHE", False), patch.object(
            drive, "download_drive_file", side_effect=fake_download
        ):
            label = drive.copy_or_download_background_video(
                object(),
                "direct1",
                self.destination,
                file_name="direct.mp4",
                label="Google Drive: direct.mp4",
            )

        self.assertEqual(downloaded, [("direct1", self.destination)])
        self.assertEqual(label, "Google Drive: direct.mp4")
        self.assertFalse(any(self.cache_root.iterdir()))


if __name__ == "__main__":
    unittest.main()
