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

    def matches(self, row_number: int) -> bool:
        end = self.to_row if self.to_row is not None else self.from_row
        return self.from_row <= row_number <= end


def _rule_from_dict(data: dict[str, Any]) -> RowRangeRule:
    from_row = int(data["from_row"])
    to_raw = data.get("to_row")
    to_row = int(to_raw) if to_raw not in (None, "", 0) else None
    return RowRangeRule(
        from_row=from_row,
        to_row=to_row,
        background_video_id=str(data.get("background_video_id") or "").strip(),
        background_video_name=str(data.get("background_video_name") or "").strip(),
        thumbnail_file_id=str(data.get("thumbnail_file_id") or "").strip(),
        thumbnail_name=str(data.get("thumbnail_name") or "").strip(),
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
    seen_ranges: list[tuple[int, int, int]] = []
    for index, rule in enumerate(rules):
        if rule.from_row < 1:
            raise ValueError(f"Rule {index + 1}: From Row must be at least 1.")
        end = rule.to_row if rule.to_row is not None else rule.from_row
        if rule.to_row is not None and rule.to_row < rule.from_row:
            raise ValueError(f"Rule {index + 1}: To Row cannot be less than From Row.")
        if not rule.background_video_id and not rule.thumbnail_file_id:
            raise ValueError(
                f"Rule {index + 1}: Select a background video and/or thumbnail."
            )
        for start, stop, other in seen_ranges:
            if not (end < start or rule.from_row > stop):
                raise ValueError(
                    f"Rule {index + 1}: Row range {rule.from_row}-{end} "
                    f"overlaps rule for rows {start}-{stop}."
                )
        seen_ranges.append((rule.from_row, end, index))


def get_rule_for_row(row_number: int) -> RowRangeRule | None:
    for rule in load_row_rules():
        if rule.matches(row_number):
            return rule
    return None
