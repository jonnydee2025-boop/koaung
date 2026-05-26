from fastapi import APIRouter, HTTPException

from ..schemas import (
    GeminiModelSettingsPayload,
    GeminiPromptSettingsPayload,
    IntervalTriggersUpdateRequest,
    RowRulesUpdateRequest,
    payload_to_interval_trigger,
    payload_to_row_rule,
    row_rule_to_dict,
)
from ...config import (
    API_PORT,
    BACKGROUND_VIDEO_DRIVE_FOLDER,
    ENABLE_AUDIO_ENHANCE,
    FFMPEG_BIN,
    FFPROBE_BIN,
    GEMINI_API_KEY,
    ROW_RULES_PATH,
    SHEET_NAME,
    TMP_ROOT,
    missing_media_binaries,
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
from ...interval_triggers import (
    interval_triggers_to_dict,
    load_interval_triggers,
    save_interval_triggers,
    validate_interval_triggers,
)
from ...row_rules import load_row_rules, save_row_rules, validate_row_rules
from ...sheets import auto_trigger_do_for_row_rules

router = APIRouter(tags=["settings"])


@router.get("/settings")
def get_settings():
    missing = missing_media_binaries()
    gemini = load_gemini_model_settings()
    interval_meta = interval_triggers_to_dict(load_interval_triggers())
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
        "gemini_api_key_configured": bool(GEMINI_API_KEY),
        "gemini_models": gemini_settings_to_dict(gemini),
        "interval_triggers_count": interval_meta["interval_triggers_count"],
        "next_interval_trigger_at": interval_meta["next_trigger_at"],
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


@router.get("/settings/interval-triggers")
def get_interval_triggers():
    return interval_triggers_to_dict(load_interval_triggers())


@router.put("/settings/interval-triggers")
def put_interval_triggers(body: IntervalTriggersUpdateRequest):
    try:
        triggers = [payload_to_interval_trigger(item) for item in body.triggers]
        validate_interval_triggers(triggers)
        save_interval_triggers(triggers)
        return {"saved": True, **interval_triggers_to_dict(triggers)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/settings/row-rules")
def get_row_rules():
    return {"rules": [row_rule_to_dict(rule) for rule in load_row_rules()]}


@router.put("/settings/row-rules")
def put_row_rules(body: RowRulesUpdateRequest):
    try:
        rules = [payload_to_row_rule(item) for item in body.rules]
        validate_row_rules(rules)
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
