"""Row-range mapping: background video + thumbnail per sheet row range."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .config import ROW_RULES_PATH, logger


@dataclass
class RowRangeRule:
    from_row: int
    to_row: int | None = None
    background_video_id: str = ""
    background_video_name: str = ""
    thumbnail_file_id: str = ""
    thumbnail_name: str = ""
    """When set, repeat audio + background this many times (else auto loop bg only)."""
    background_loop_count: int | None = None

    def matches(self, row_number: int) -> bool:
        end = self.to_row if self.to_row is not None else self.from_row
        return self.from_row <= row_number <= end


def _rule_from_dict(data: dict[str, Any]) -> RowRangeRule:
    from_row = int(data["from_row"])
    to_raw = data.get("to_row")
    to_row = int(to_raw) if to_raw not in (None, "", 0) else None
    loop_raw = data.get("background_loop_count")
    if loop_raw in (None, "", 0):
        background_loop_count = None
    else:
        background_loop_count = int(loop_raw)
    return RowRangeRule(
        from_row=from_row,
        to_row=to_row,
        background_video_id=str(data.get("background_video_id") or "").strip(),
        background_video_name=str(data.get("background_video_name") or "").strip(),
        thumbnail_file_id=str(data.get("thumbnail_file_id") or "").strip(),
        thumbnail_name=str(data.get("thumbnail_name") or "").strip(),
        background_loop_count=background_loop_count,
    )


def load_row_rules() -> list[RowRangeRule]:
    if not ROW_RULES_PATH.is_file():
        return []
    try:
        payload = json.loads(ROW_RULES_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Could not read row rules file: %s", exc)
        return []
    rules_raw = payload.get("rules", payload if isinstance(payload, list) else [])
    if not isinstance(rules_raw, list):
        return []
    return [_rule_from_dict(item) for item in rules_raw if isinstance(item, dict)]


def save_row_rules(rules: list[RowRangeRule]) -> None:
    ROW_RULES_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"rules": [asdict(rule) for rule in rules]}
    ROW_RULES_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def validate_row_rules(rules: list[RowRangeRule]) -> None:
    if not rules:
        return
    for index, rule in enumerate(rules):
        if rule.from_row < 1:
            raise ValueError(f"Rule {index + 1}: From Row must be at least 1.")
        end = rule.to_row if rule.to_row is not None else rule.from_row
        if rule.to_row is not None and rule.to_row < rule.from_row:
            raise ValueError(f"Rule {index + 1}: To Row cannot be less than From Row.")
        if (
            not rule.background_video_id
            and not rule.thumbnail_file_id
            and rule.background_loop_count is None
        ):
            raise ValueError(
                f"Rule {index + 1}: Set a background, thumbnail, and/or loop count."
            )
        if rule.background_loop_count is not None and rule.background_loop_count < 1:
            raise ValueError(f"Rule {index + 1}: Loop count must be at least 1.")
        if rule.background_loop_count is not None and rule.background_loop_count > 500:
            raise ValueError(f"Rule {index + 1}: Loop count cannot exceed 500.")

    for i, rule in enumerate(rules):
        end_i = rule.to_row if rule.to_row is not None else rule.from_row
        for j in range(i + 1, len(rules)):
            other = rules[j]
            end_j = other.to_row if other.to_row is not None else other.from_row
            if end_i < other.from_row or rule.from_row > end_j:
                continue
            if rule.background_video_id and other.background_video_id:
                raise ValueError(
                    f"Rules {i + 1} and {j + 1}: overlapping rows cannot both "
                    "set a background video."
                )
            if rule.thumbnail_file_id and other.thumbnail_file_id:
                raise ValueError(
                    f"Rules {i + 1} and {j + 1}: overlapping rows cannot both "
                    "set a thumbnail."
                )
            if (
                rule.background_loop_count is not None
                and other.background_loop_count is not None
            ):
                raise ValueError(
                    f"Rules {i + 1} and {j + 1}: overlapping rows cannot both "
                    "set a loop count."
                )


def get_rule_for_row(row_number: int) -> RowRangeRule | None:
    """
    Merge all rules that match this sheet row (use sheet row numbers from the Jobs tab).
    Later rules override earlier ones for the same field (background / thumbnail / loops).
    """
    matching = [rule for rule in load_row_rules() if rule.matches(row_number)]
    if not matching:
        return None

    effective = RowRangeRule(from_row=row_number, to_row=row_number)
    for rule in matching:
        if rule.background_video_id:
            effective.background_video_id = rule.background_video_id
            effective.background_video_name = rule.background_video_name
        if rule.thumbnail_file_id:
            effective.thumbnail_file_id = rule.thumbnail_file_id
            effective.thumbnail_name = rule.thumbnail_name
        if rule.background_loop_count is not None:
            effective.background_loop_count = rule.background_loop_count

    if (
        not effective.background_video_id
        and not effective.thumbnail_file_id
        and effective.background_loop_count is None
    ):
        return None
    return effective


def get_background_loop_count_for_row(row_number: int) -> int | None:
    rule = get_rule_for_row(row_number)
    if rule is None:
        return None
    return rule.background_loop_count
