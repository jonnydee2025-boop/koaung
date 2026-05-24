"""Pydantic request/response models for the admin API."""

from typing import Literal

from pydantic import BaseModel, Field

from ..row_rules import RowRangeRule, parse_batch_rows_string


class ScheduleJobRequest(BaseModel):
    schedule_time: str = Field(
        ...,
        description="ISO 8601 date/time (e.g. 2026-05-22T14:30:00+00:00)",
    )


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
