from fastapi import APIRouter, HTTPException

from ..schemas import RowRulesUpdateRequest, payload_to_row_rule, row_rule_to_dict
from ...config import (
    API_PORT,
    BACKGROUND_VIDEO_DRIVE_FOLDER,
    ENABLE_AUDIO_ENHANCE,
    FFMPEG_BIN,
    FFPROBE_BIN,
    ROW_RULES_PATH,
    SHEET_NAME,
    TMP_ROOT,
    missing_media_binaries,
)
from ...drive import fetch_drive_media_catalog
from ...row_rules import load_row_rules, save_row_rules, validate_row_rules

router = APIRouter(tags=["settings"])


@router.get("/settings")
def get_settings():
    missing = missing_media_binaries()
    return {
        "sheet_name": SHEET_NAME,
        "tmp_root": str(TMP_ROOT),
        "ffmpeg_bin": FFMPEG_BIN,
        "ffprobe_bin": FFPROBE_BIN,
        "media_binaries_ok": not missing,
        "missing_media_binaries": missing,
        "background_video_folder": BACKGROUND_VIDEO_DRIVE_FOLDER,
        "enable_audio_enhance": ENABLE_AUDIO_ENHANCE,
        "api_port": API_PORT,
        "row_rules_path": str(ROW_RULES_PATH),
    }


@router.get("/settings/row-rules")
def get_row_rules():
    return {"rules": [row_rule_to_dict(rule) for rule in load_row_rules()]}


@router.put("/settings/row-rules")
def put_row_rules(body: RowRulesUpdateRequest):
    try:
        rules = [payload_to_row_rule(item) for item in body.rules]
        validate_row_rules(rules)
        save_row_rules(rules)
        return {"saved": True, "count": len(rules)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/drive/media-options")
def get_drive_media_options():
    try:
        return fetch_drive_media_catalog()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
