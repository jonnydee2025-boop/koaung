"""Admin MP3 player favorites and remarks keyed by sheet row."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from .config import JOB_PLAYER_PREFS_PATH, logger


@dataclass
class JobPlayerPref:
    favorite: bool = False
    remark: str = ""


def _normalize_entry(data: Any) -> JobPlayerPref | None:
    if not isinstance(data, dict):
        return None
    favorite = bool(data.get("favorite"))
    remark = str(data.get("remark") or "")
    if not favorite and not remark.strip():
        return None
    return JobPlayerPref(favorite=favorite, remark=remark)


def load_job_player_prefs() -> dict[str, dict[str, Any]]:
    if not JOB_PLAYER_PREFS_PATH.is_file():
        return {}
    try:
        payload = json.loads(JOB_PLAYER_PREFS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Could not read job player prefs file: %s", exc)
        return {}
    raw = payload.get("prefs", payload if isinstance(payload, dict) else {})
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for key, value in raw.items():
        entry = _normalize_entry(value)
        if entry is not None:
            out[str(key)] = job_player_pref_to_dict(entry)
    return out


def save_job_player_prefs(prefs: dict[str, dict[str, Any]]) -> None:
    JOB_PLAYER_PREFS_PATH.parent.mkdir(parents=True, exist_ok=True)
    cleaned: dict[str, dict[str, Any]] = {}
    for key, value in prefs.items():
        entry = _normalize_entry(value)
        if entry is not None:
            cleaned[str(key)] = job_player_pref_to_dict(entry)
    payload = {"prefs": cleaned}
    JOB_PLAYER_PREFS_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def job_player_pref_to_dict(pref: JobPlayerPref) -> dict[str, Any]:
    return {"favorite": bool(pref.favorite), "remark": pref.remark}


def get_job_player_pref(row_number: int) -> JobPlayerPref:
    entry = load_job_player_prefs().get(str(row_number))
    if not entry:
        return JobPlayerPref()
    return _normalize_entry(entry) or JobPlayerPref()


def set_job_player_pref(row_number: int, *, favorite: bool, remark: str) -> JobPlayerPref:
    if row_number < 1:
        raise ValueError("Row number must be at least 1.")
    prefs = load_job_player_prefs()
    key = str(row_number)
    remark_text = str(remark or "")
    if not favorite and not remark_text.strip():
        prefs.pop(key, None)
        pref = JobPlayerPref()
    else:
        pref = JobPlayerPref(favorite=bool(favorite), remark=remark_text)
        prefs[key] = job_player_pref_to_dict(pref)
    save_job_player_prefs(prefs)
    return pref
