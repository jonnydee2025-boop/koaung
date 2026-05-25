"""Tests for Jobs API listing helpers."""

import unittest

from helpers import sample_job
from video_bot.api.job_listing import (
    JOB_STATUS_FILTER_KEYS,
    filter_jobs,
    job_status_counts,
)


class JobListingTests(unittest.TestCase):
    def test_job_status_counts_splits_pending_and_do(self) -> None:
        jobs = [
            sample_job(1, "pending"),
            sample_job(2, "pending"),
            sample_job(3, "do"),
            sample_job(4, "done"),
            sample_job(5, "uploaded_to_yt"),
            sample_job(6, "processing"),
            sample_job(7, "scheduled"),
            sample_job(8, "failed"),
        ]
        counts = job_status_counts(jobs)
        self.assertEqual(list(counts.keys()), list(JOB_STATUS_FILTER_KEYS))
        self.assertEqual(counts["all"], 8)
        self.assertEqual(counts["pending"], 2)
        self.assertEqual(counts["do"], 1)
        self.assertEqual(counts["done"], 2)
        self.assertEqual(counts["processing"], 1)
        self.assertEqual(counts["scheduled"], 1)
        self.assertEqual(counts["failed"], 1)

    def test_filter_jobs_pending_excludes_do(self) -> None:
        jobs = [sample_job(1, "pending"), sample_job(2, "do")]
        self.assertEqual(filter_jobs(jobs, "pending", ""), [sample_job(1, "pending")])
        self.assertEqual(filter_jobs(jobs, "do", ""), [sample_job(2, "do")])

    def test_filter_jobs_search_matches_monk_name(self) -> None:
        jobs = [
            sample_job(1, "pending", title="Morning talk", monk="U Vimala"),
            sample_job(2, "pending", title="Evening talk", monk="U Pandita"),
        ]
        self.assertEqual(
            filter_jobs(jobs, "all", "vimala"),
            [sample_job(1, "pending", title="Morning talk", monk="U Vimala")],
        )


if __name__ == "__main__":
    unittest.main()
