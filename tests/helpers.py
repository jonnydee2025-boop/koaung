"""Shared test fixtures."""


def sample_job(row: int, status: str, title: str = "Title", monk: str = "Monk") -> dict:
    return {
        "row": row,
        "status": status,
        "title": title,
        "monk": monk,
        "logs": "",
        "youtube_id": "",
        "schedule_time": "",
    }
