"""Tests for repeat-only multi-thumbnail runs."""

import unittest

from video_bot.repeat_jobs import (
    RepeatJob,
    RepeatThumbnail,
    bump_repeat_run_count,
    repeat_run_has_thumbnail,
    repeat_thumbnail_for_run,
    save_repeat_job,
    load_repeat_jobs,
    _parse_repeat_thumbnails,
)
from video_bot.row_rules import (
    RowRangeRule,
    validate_row_rules_for_repeat_anchors,
)


class RepeatThumbnailTests(unittest.TestCase):
    def test_parse_thumbnails_from_json(self) -> None:
        items = _parse_repeat_thumbnails(
            [
                {"file_id": "a", "name": "one.jpg"},
                {"file_id": "b", "name": "two.jpg"},
            ]
        )
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0].file_id, "a")

    def test_thumbnail_for_run_uses_run_count_index(self) -> None:
        job = RepeatJob(
            anchor_row=7884,
            repeat_type="daily",
            thumbnails=[
                RepeatThumbnail(file_id="t1", name="1.jpg"),
                RepeatThumbnail(file_id="t2", name="2.jpg"),
            ],
            run_count=0,
        )
        first = repeat_thumbnail_for_run(job)
        self.assertIsNotNone(first)
        assert first is not None
        self.assertEqual(first.file_id, "t1")
        self.assertTrue(repeat_run_has_thumbnail(job))

        job.run_count = 1
        second = repeat_thumbnail_for_run(job)
        assert second is not None
        self.assertEqual(second.file_id, "t2")

        job.run_count = 2
        self.assertIsNone(repeat_thumbnail_for_run(job))
        self.assertFalse(repeat_run_has_thumbnail(job))

    def test_bump_run_count_persists(self) -> None:
        job = RepeatJob(
            anchor_row=99999,
            repeat_type="daily",
            thumbnails=[RepeatThumbnail(file_id="x", name="x.jpg")],
            run_count=0,
        )
        try:
            save_repeat_job(job)
            bump_repeat_run_count(99999)
            loaded = load_repeat_jobs().get(99999)
            self.assertIsNotNone(loaded)
            assert loaded is not None
            self.assertEqual(loaded.run_count, 1)
        finally:
            from video_bot.repeat_jobs import delete_repeat_job

            delete_repeat_job(99999)


class RepeatRowRulesValidationTests(unittest.TestCase):
    def test_blocks_thumbnail_for_repeat_anchor(self) -> None:
        rules = [
            RowRangeRule(
                from_row=7884,
                batch_rows="7884",
                background_video_id="bg1",
                thumbnail_file_id="thumb1",
            )
        ]
        with self.assertRaises(ValueError) as ctx:
            validate_row_rules_for_repeat_anchors(rules, {7884})
        self.assertIn("repeat", str(ctx.exception).lower())

    def test_allows_background_without_thumbnail_for_repeat(self) -> None:
        rules = [
            RowRangeRule(
                from_row=7884,
                batch_rows="7884",
                background_video_id="bg1",
            )
        ]
        validate_row_rules_for_repeat_anchors(rules, {7884})


if __name__ == "__main__":
    unittest.main()
