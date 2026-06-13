"""Row-range mapping: background video + thumbnail per sheet row range."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
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
    """Comma-separated sheet row numbers for batch concat (first row is anchor)."""
    batch_rows: str = ""

    def matches(self, row_number: int) -> bool:
        return row_number in parse_batch_rows(self)


def parse_batch_rows_string(raw: str) -> list[int]:
    """Parse comma-separated row numbers; empty string returns []."""
    if not raw or not str(raw).strip():
        return []
    parts = re.split(r"[\s,]+", str(raw).strip())
    rows: list[int] = []
    seen: set[int] = set()
    for part in parts:
        if not part:
            continue
        value = int(part)
        if value < 1:
            raise ValueError(f"Row number must be at least 1 (got {value}).")
        if value in seen:
            raise ValueError(f"Duplicate row number {value} in Select Rows.")
        seen.add(value)
        rows.append(value)
    return rows


def parse_batch_rows(rule: RowRangeRule) -> list[int]:
    """
    Return ordered sheet row numbers for this rule.
    Uses batch_rows when set; otherwise legacy from_row..to_row range or single from_row.
    """
    explicit = parse_batch_rows_string(rule.batch_rows)
    if explicit:
        return explicit
    if rule.to_row is not None and rule.to_row >= rule.from_row:
        return list(range(rule.from_row, rule.to_row + 1))
    return [rule.from_row]


def batch_anchor_row(rule: RowRangeRule) -> int:
    rows = parse_batch_rows(rule)
    return rows[0]


def is_multi_row_batch(rule: RowRangeRule) -> bool:
    return len(parse_batch_rows(rule)) > 1


def _rule_from_dict(data: dict[str, Any]) -> RowRangeRule:
    batch_rows = str(data.get("batch_rows") or "").strip()
    if batch_rows:
        parsed = parse_batch_rows_string(batch_rows)
        from_row = parsed[0]
        to_row = None
    else:
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
        batch_rows=batch_rows,
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


def _batch_rows_overlap(rows_a: list[int], rows_b: list[int]) -> bool:
    return bool(set(rows_a) & set(rows_b))


def validate_row_rules_for_repeat_anchors(
    rules: list[RowRangeRule],
    repeat_anchors: set[int],
) -> None:
    """Repeat jobs use Jobs → Schedule → Repeat for bg, loop, and thumbnails."""
    if not repeat_anchors:
        return
    for index, rule in enumerate(rules):
        anchor = batch_anchor_row(rule)
        if anchor not in repeat_anchors:
            continue
        if (
            rule.background_video_id
            or rule.thumbnail_file_id
            or rule.background_loop_count is not None
        ):
            raise ValueError(
                f"Rule {index + 1}: row #{anchor} is a repeat job — set background, "
                "loop, and thumbnails in Jobs → Schedule → Repeat, not in row rules."
            )


def clear_row_rules_for_repeat_anchor(anchor_number: int) -> bool:
    """Remove row rules for a repeat anchor (repeat uses Schedule → Repeat settings)."""
    rules = load_row_rules()
    remaining = [rule for rule in rules if batch_anchor_row(rule) != anchor_number]
    if len(remaining) == len(rules):
        return False
    save_row_rules(remaining)
    logger.info("Removed row rules for repeat anchor row %s", anchor_number)
    return True


def clear_row_rule_thumbnail_for_anchor(anchor_number: int) -> bool:
    """Deprecated alias — removes all row rules for the repeat anchor."""
    return clear_row_rules_for_repeat_anchor(anchor_number)


def prune_row_rules_for_repeat_anchors(repeat_anchors: set[int]) -> bool:
    """Drop stale row rules that still reference repeat anchor rows."""
    if not repeat_anchors:
        return False
    rules = load_row_rules()
    remaining = [
        rule for rule in rules if batch_anchor_row(rule) not in repeat_anchors
    ]
    if len(remaining) == len(rules):
        return False
    save_row_rules(remaining)
    logger.info(
        "Pruned row rules for repeat anchors: %s",
        ", ".join(str(row) for row in sorted(repeat_anchors)),
    )
    return True


def consume_row_rules_after_render(anchor_number: int, *, is_repeat: bool = False) -> bool:
    """
    After a successful one-time render (do or scheduled), drop row rules for this anchor.
    Repeat jobs keep their media settings in repeat_jobs.json instead.
    """
    if is_repeat or anchor_number < 1:
        return False

    rules = load_row_rules()
    if not rules:
        return False

    remaining: list[RowRangeRule] = []
    removed = False
    for rule in rules:
        if batch_anchor_row(rule) == anchor_number:
            removed = True
            rows_label = rule.batch_rows.strip() or str(rule.from_row)
            logger.info(
                "Consumed row rule for anchor row %s (rows: %s)",
                anchor_number,
                rows_label,
            )
            continue
        remaining.append(rule)

    if not removed:
        return False

    save_row_rules(remaining)
    return True


def validate_row_rules(rules: list[RowRangeRule]) -> None:
    if not rules:
        return
    for index, rule in enumerate(rules):
        try:
            batch = parse_batch_rows(rule)
        except ValueError as exc:
            raise ValueError(f"Rule {index + 1}: {exc}") from exc
        if not batch:
            raise ValueError(f"Rule {index + 1}: Select Rows must include at least one row.")
        if rule.from_row < 1:
            raise ValueError(f"Rule {index + 1}: From Row must be at least 1.")
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
        batch_i = parse_batch_rows(rule)
        for j in range(i + 1, len(rules)):
            other = rules[j]
            batch_j = parse_batch_rows(other)
            if not _batch_rows_overlap(batch_i, batch_j):
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
            if is_multi_row_batch(rule) and is_multi_row_batch(other):
                raise ValueError(
                    f"Rules {i + 1} and {j + 1}: a sheet row cannot belong to "
                    "two batch rules."
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


def get_batch_rule_for_anchor(row_number: int) -> tuple[RowRangeRule, list[int]] | None:
    """Return rule + ordered rows when row_number is the anchor of a multi-row batch."""
    for rule in load_row_rules():
        rows = parse_batch_rows(rule)
        if len(rows) > 1 and rows[0] == row_number:
            return rule, rows
    return None


def is_batch_member_row(row_number: int) -> bool:
    """True when row appears in a multi-row batch but is not the anchor."""
    for rule in load_row_rules():
        rows = parse_batch_rows(rule)
        if len(rows) > 1 and row_number in rows and rows[0] != row_number:
            return True
    return False


def resolve_batch_anchor_row(row_number: int) -> int:
    """
    Return the anchor row for batch processing.
    If row_number is a batch member, returns the anchor; otherwise returns row_number.
    """
    for rule in load_row_rules():
        rows = parse_batch_rows(rule)
        if len(rows) > 1 and row_number in rows:
            return rows[0]
    return row_number


def get_background_loop_count_for_row(row_number: int) -> int | None:
    for rule in load_row_rules():
        if rule.matches(row_number) and is_multi_row_batch(rule):
            return None
    rule = get_rule_for_row(row_number)
    if rule is None:
        return None
    return rule.background_loop_count


def row_has_thumbnail(row_number: int) -> bool:
    rule = get_rule_for_row(row_number)
    return bool(rule and rule.thumbnail_file_id)
