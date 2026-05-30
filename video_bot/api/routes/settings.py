from fastapi import APIRouter, HTTPException

from ..schemas import (
    GeminiModelSettingsPayload,
    GeminiPromptSettingsPayload,
    RowRulesUpdateRequest,
    payload_to_row_rule,
    row_rule_to_dict,
)
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
from ...gemini_api_keys import (
    get_api_key_chain,
    load_api_keys,
    merge_api_key_updates,
    save_api_keys,
)
from ...drive import fetch_drive_media_catalog
from ...gemini_prompt_settings import (
    GeminiPromptSettings,
    gemini_prompt_settings_to_dict,
    load_gemini_prompt_settings,
    save_gemini_prompt_settings,
    validate_gemini_prompt_settings,
)
from ...gemini_settings import (
    GeminiModelSettings,
    dedupe_models,
    gemini_settings_to_dict,
    load_gemini_model_settings,
    save_gemini_model_settings,
    validate_gemini_model_settings,
)
from ...repeat_jobs import load_repeat_jobs
from ...row_rules import (
    load_row_rules,
    save_row_rules,
    validate_row_rules,
    validate_row_rules_for_repeat_anchors,
)
from ...sheet_cache import get_cached_sheet_rows
from ...sheets import auto_trigger_do_for_row_rules

router = APIRouter(tags=["settings"])


@router.get("/settings")
def get_settings():
    missing = missing_media_binaries()
    gemini = load_gemini_model_settings()
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
        "gemini_api_key_configured": bool(get_api_key_chain()),
        "gemini_models": gemini_settings_to_dict(gemini),
    }


@router.get("/settings/gemini-models")
def get_gemini_models():
    return gemini_settings_to_dict(load_gemini_model_settings())


@router.put("/settings/gemini-models")
def put_gemini_models(body: GeminiModelSettingsPayload):
    try:
        primary = body.primary_model.strip()
        fallbacks = dedupe_models(
            [model.strip() for model in body.fallback_models if model.strip()],
        )
        fallbacks = [
            model for model in fallbacks if model.casefold() != primary.casefold()
        ]
        settings = GeminiModelSettings(
            primary_model=primary,
            fallback_models=fallbacks,
        )
        validate_gemini_model_settings(settings)
        save_gemini_model_settings(settings)
        if body.api_keys is not None:
            merged_keys = merge_api_key_updates(load_api_keys(), body.api_keys)
            save_api_keys(merged_keys)
        return {"saved": True, **gemini_settings_to_dict(settings)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/settings/gemini-prompt")
def get_gemini_prompt():
    return gemini_prompt_settings_to_dict(load_gemini_prompt_settings())


@router.put("/settings/gemini-prompt")
def put_gemini_prompt(body: GeminiPromptSettingsPayload):
    try:
        settings = GeminiPromptSettings(
            channel_brand=body.channel_brand.strip(),
            temperature=body.temperature,
            system_prompt=body.system_prompt,
            user_prompt_template=body.user_prompt_template,
            response_schema=body.response_schema,
            description_template=body.description_template,
            title_field=body.title_field.strip(),
            tags_field=body.tags_field.strip(),
            hashtags_field=body.hashtags_field.strip(),
            credit_field=body.credit_field.strip(),
        )
        validate_gemini_prompt_settings(settings)
        save_gemini_prompt_settings(settings)
        return {"saved": True, **gemini_prompt_settings_to_dict(settings)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/settings/row-rules")
def get_row_rules():
    _, rows = get_cached_sheet_rows()
    repeat_anchors: set[int] = set(load_repeat_jobs().keys())
    for row in rows:
        if row.values.get("status", "").strip().lower() == "repeat":
            repeat_anchors.add(row.row_number)
    return {
        "rules": [row_rule_to_dict(rule) for rule in load_row_rules()],
        "repeat_anchors": sorted(repeat_anchors),
    }


@router.put("/settings/row-rules")
def put_row_rules(body: RowRulesUpdateRequest):
    try:
        rules = [payload_to_row_rule(item) for item in body.rules]
        validate_row_rules(rules)
        _, rows = get_cached_sheet_rows()
        repeat_anchors: set[int] = set(load_repeat_jobs().keys())
        for row in rows:
            if row.values.get("status", "").strip().lower() == "repeat":
                repeat_anchors.add(row.row_number)
        validate_row_rules_for_repeat_anchors(rules, repeat_anchors)
        save_row_rules(rules)
        trigger_result = auto_trigger_do_for_row_rules(rules)
        return {
            "saved": True,
            "count": len(rules),
            **trigger_result,
        }
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
