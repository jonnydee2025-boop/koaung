"""Tests for repeat-only multi-thumbnail runs."""

import unittest

from video_bot.repeat_jobs import (
    RepeatJob,
    RepeatThumbnail,
    consume_repeat_thumbnail_after_success,
    repeat_run_has_thumbnail,
    repeat_thumbnail_for_run,
    save_repeat_job,
    load_repeat_jobs,
    _parse_repeat_thumbnails,
    delete_repeat_job,
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

    def test_thumbnail_for_run_uses_first_queued(self) -> None:
        job = RepeatJob(
            anchor_row=7884,
            repeat_type="daily",
            thumbnails=[
                RepeatThumbnail(file_id="t1", name="1.jpg"),
                RepeatThumbnail(file_id="t2", name="2.jpg"),
            ],
            run_count=3,
        )
        first = repeat_thumbnail_for_run(job)
        self.assertIsNotNone(first)
        assert first is not None
        self.assertEqual(first.file_id, "t1")
        self.assertTrue(repeat_run_has_thumbnail(job))

    def test_consume_removes_used_thumbnail_after_success(self) -> None:
        job = RepeatJob(
            anchor_row=99998,
            repeat_type="daily",
            thumbnails=[
                RepeatThumbnail(file_id="t1", name="1.jpg"),
                RepeatThumbnail(file_id="t2", name="2.jpg"),
            ],
            run_count=0,
        )
        try:
            save_repeat_job(job)
            consume_repeat_thumbnail_after_success(99998, consumed_file_id="t1")
            loaded = load_repeat_jobs().get(99998)
            self.assertIsNotNone(loaded)
            assert loaded is not None
            self.assertEqual(loaded.run_count, 1)
            self.assertEqual(len(loaded.thumbnails), 1)
            self.assertEqual(loaded.thumbnails[0].file_id, "t2")
            self.assertEqual(repeat_thumbnail_for_run(loaded).file_id, "t2")
        finally:
            delete_repeat_job(99998)

    def test_consume_without_thumbnail_only_increments_run_count(self) -> None:
        job = RepeatJob(
            anchor_row=99997,
            repeat_type="daily",
            thumbnails=[RepeatThumbnail(file_id="x", name="x.jpg")],
            run_count=0,
        )
        try:
            save_repeat_job(job)
            consume_repeat_thumbnail_after_success(99997, consumed_file_id=None)
            loaded = load_repeat_jobs().get(99997)
            self.assertIsNotNone(loaded)
            assert loaded is not None
            self.assertEqual(loaded.run_count, 1)
            self.assertEqual(len(loaded.thumbnails), 1)
        finally:
            delete_repeat_job(99997)


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


class RepeatBatchThumbnailTests(unittest.TestCase):
    def test_repeat_with_row_rule_is_still_repeat(self) -> None:
        """Repeat anchors almost always have a row rule (background/batch)."""
        repeat_job = RepeatJob(
            anchor_row=7884,
            repeat_type="daily",
            thumbnails=[RepeatThumbnail(file_id="thumb-a", name="a.jpg")],
        )
        has_batch_rule = True
        is_repeat = repeat_job is not None
        self.assertTrue(has_batch_rule)
        self.assertTrue(is_repeat)
        thumb = repeat_thumbnail_for_run(repeat_job)
        self.assertIsNotNone(thumb)
        assert thumb is not None
        self.assertEqual(thumb.file_id, "thumb-a")


if __name__ == "__main__":
    unittest.main()
