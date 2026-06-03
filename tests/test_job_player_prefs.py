import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from video_bot import job_player_prefs


class JobPlayerPrefsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.prefs_path = Path(self.temp_dir.name) / "job_player_prefs.json"
        patcher = patch.object(job_player_prefs, "JOB_PLAYER_PREFS_PATH", self.prefs_path)
        self.addCleanup(patcher.stop)
        patcher.start()

    def test_set_and_load_favorite_and_remark(self) -> None:
        job_player_prefs.set_job_player_pref(42, favorite=True, remark="Check intro")
        prefs = job_player_prefs.load_job_player_prefs()
        self.assertEqual(prefs["42"], {"favorite": True, "remark": "Check intro"})

    def test_clear_pref_when_empty(self) -> None:
        job_player_prefs.set_job_player_pref(7, favorite=True, remark="Keep")
        job_player_prefs.set_job_player_pref(7, favorite=False, remark="")
        self.assertEqual(job_player_prefs.load_job_player_prefs(), {})

    def test_load_missing_file_returns_empty(self) -> None:
        self.assertEqual(job_player_prefs.load_job_player_prefs(), {})

    def test_load_corrupt_file_returns_empty(self) -> None:
        self.prefs_path.write_text("{not json", encoding="utf-8")
        self.assertEqual(job_player_prefs.load_job_player_prefs(), {})

    def test_save_writes_json_file(self) -> None:
        job_player_prefs.set_job_player_pref(10, favorite=False, remark="Note")
        payload = json.loads(self.prefs_path.read_text(encoding="utf-8"))
        self.assertEqual(payload["prefs"]["10"]["remark"], "Note")


if __name__ == "__main__":
    unittest.main()
