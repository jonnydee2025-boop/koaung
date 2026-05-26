"""Pydantic request/response models for the admin API."""

from typing import Literal

from pydantic import BaseModel, Field

from ..interval_triggers import IntervalTrigger
from ..row_rules import RowRangeRule, parse_batch_rows_string


class ScheduleJobRequest(BaseModel):
    mode: Literal["once", "repeat"] = "once"
    schedule_time: str | None = Field(
        default=None,
        description="ISO 8601 date/time for one-time schedule",
    )
    repeat_type: Literal["daily", "weekly"] = "daily"
    repeat_time: str = "07:00"
    days_of_week: list[int] = Field(default_factory=list)
    timezone: str = "UTC"


class UpdateJobStatusRequest(BaseModel):
    status: Literal["pending", "do", "failed", "done"]


class RowRangeRulePayload(BaseModel):
    from_row: int = Field(..., ge=1)
    to_row: int | None = Field(default=None, ge=1)
    background_video_id: str = ""
    background_video_name: str = ""
    thumbnail_file_id: str = ""
    thumbnail_name: str = ""
    background_loop_count: int | None = Field(default=None, ge=1, le=500)
    batch_rows: str = ""


class RowRulesUpdateRequest(BaseModel):
    rules: list[RowRangeRulePayload]


class GeminiModelSettingsPayload(BaseModel):
    primary_model: str = Field(..., min_length=1, max_length=64)
    fallback_models: list[str] = Field(default_factory=list)


class IntervalTriggerPayload(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    name: str = ""
    enabled: bool = True
    schedule_type: Literal["weekly", "daily", "once"] = "daily"
    time: str = "09:00"
    days_of_week: list[int] = Field(default_factory=list)
    once_at: str | None = None
    timezone: str = "UTC"
    last_fired_at: str | None = None


class IntervalTriggersUpdateRequest(BaseModel):
    triggers: list[IntervalTriggerPayload]


def payload_to_interval_trigger(item: IntervalTriggerPayload) -> IntervalTrigger:
    return IntervalTrigger(
        id=item.id.strip(),
        name=item.name.strip(),
        enabled=item.enabled,
        schedule_type=item.schedule_type,
        time=item.time.strip(),
        days_of_week=list(item.days_of_week),
        once_at=item.once_at.strip() if item.once_at else None,
        timezone=item.timezone.strip() or "UTC",
        last_fired_at=item.last_fired_at,
    )


def payload_to_row_rule(item: RowRangeRulePayload) -> RowRangeRule:
    batch_rows = item.batch_rows.strip()
    if batch_rows:
        parsed = parse_batch_rows_string(batch_rows)
        from_row = parsed[0]
        to_row = None
    else:
        from_row = item.from_row
        to_row = item.to_row
    return RowRangeRule(
        from_row=from_row,
        to_row=to_row,
        background_video_id=item.background_video_id.strip(),
        background_video_name=item.background_video_name.strip(),
        thumbnail_file_id=item.thumbnail_file_id.strip(),
        thumbnail_name=item.thumbnail_name.strip(),
        background_loop_count=item.background_loop_count,
        batch_rows=batch_rows,
    )


def row_rule_to_dict(rule: RowRangeRule) -> dict:
    return {
        "from_row": rule.from_row,
        "to_row": rule.to_row,
        "background_video_id": rule.background_video_id,
        "background_video_name": rule.background_video_name,
        "thumbnail_file_id": rule.thumbnail_file_id,
        "thumbnail_name": rule.thumbnail_name,
        "background_loop_count": rule.background_loop_count,
        "batch_rows": rule.batch_rows,
    }
