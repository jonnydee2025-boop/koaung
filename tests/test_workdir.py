"""Tests for render workdir helpers."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from video_bot.jobs.workdir import (
    cleanup_stale_workdirs,
    find_render_workdir,
    find_rendered_video,
)


class WorkdirHelperTests(unittest.TestCase):
    def test_find_render_workdir_returns_newest_match(self) -> None:
        import os
        import time

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            older = root / "render_70_aaa"
            newer = root / "render_70_bbb"
            older.mkdir()
            time.sleep(0.02)
            newer.mkdir()
            now = time.time()
            os.utime(older, (now - 10, now - 10))
            os.utime(newer, (now, now))
            with patch("video_bot.jobs.workdir.TMP_ROOT", root):
                found = find_render_workdir(70)
            self.assertEqual(found, newer)

    def test_find_rendered_video_picks_non_empty_mp4(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workdir = Path(tmp)
            empty = workdir / "empty.mp4"
            full = workdir / "full.mp4"
            empty.write_bytes(b"")
            full.write_bytes(b"1234")
            self.assertEqual(find_rendered_video(workdir), full)

    def test_cleanup_skips_protected_repeat_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repeat_dir = root / "render_99_old"
            other_dir = root / "render_10_old"
            repeat_dir.mkdir()
            other_dir.mkdir()
            old_time = 1_000_000_000
            for path in (repeat_dir, other_dir):
                path.joinpath("full.mp4").write_bytes(b"x")
                import os

                os.utime(path, (old_time, old_time))
            with patch("video_bot.jobs.workdir.TMP_ROOT", root):
                cleanup_stale_workdirs(max_age_hours=0, protected_row_numbers={99})
            self.assertTrue(repeat_dir.exists())
            self.assertFalse(other_dir.exists())


if __name__ == "__main__":
    unittest.main()
