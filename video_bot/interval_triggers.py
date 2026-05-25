"""Persisted interval triggers for do-only batch rendering."""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .config import INTERVAL_TRIGGERS_PATH, logger

ScheduleType = Literal["weekly", "daily", "once"]
TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")

KNOWN_TIMEZONES = (
    "UTC",
    "Asia/Yangon",
    "Asia/Bangkok",
    "Asia/Singapore",
    "Asia/Kolkata",
    "Asia/Tokyo",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
)

WEEKDAY_LABELS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


@dataclass
class IntervalTrigger:
    id: str
    name: str
    enabled: bool
    schedule_type: ScheduleType
    time: str = "09:00"
    days_of_week: list[int] = field(default_factory=list)
    once_at: str | None = None
    timezone: str = "UTC"
    last_fired_at: str | None = None


def _parse_time(text: str) -> tuple[int, int]:
    match = TIME_RE.match((text or "").strip())
    if not match:
        raise ValueError(f"Invalid time {text!r}; use HH:MM (24-hour).")
    return int(match.group(1)), int(match.group(2))


def _zoneinfo(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"Unknown timezone: {name!r}") from exc


def _trigger_from_dict(data: dict[str, Any]) -> IntervalTrigger:
    trigger_id = str(data.get("id") or "").strip() or str(uuid.uuid4())
    schedule_type = str(data.get("schedule_type", "daily")).strip().lower()
    if schedule_type not in ("weekly", "daily", "once"):
        raise ValueError(f"Invalid schedule_type: {schedule_type!r}")
    raw_days = data.get("days_of_week", [])
    days: list[int] = []
    if isinstance(raw_days, list):
        for item in raw_days:
            day = int(item)
            if day < 0 or day > 6:
                raise ValueError(f"days_of_week values must be 0-6 (Mon-Sun), got {day}.")
            if day not in days:
                days.append(day)
    once_raw = data.get("once_at")
    once_at = str(once_raw).strip() if once_raw not in (None, "") else None
    return IntervalTrigger(
        id=trigger_id,
        name=str(data.get("name") or "").strip(),
        enabled=bool(data.get("enabled", True)),
        schedule_type=schedule_type,  # type: ignore[arg-type]
        time=str(data.get("time") or "09:00").strip(),
        days_of_week=days,
        once_at=once_at,
        timezone=str(data.get("timezone") or "UTC").strip() or "UTC",
        last_fired_at=(
            str(data.get("last_fired_at")).strip()
            if data.get("last_fired_at") not in (None, "")
            else None
        ),
    )


def validate_interval_triggers(triggers: list[IntervalTrigger]) -> None:
    seen_ids: set[str] = set()
    for index, trigger in enumerate(triggers):
        label = trigger.name or f"Trigger {index + 1}"
        if not trigger.id:
            raise ValueError(f"{label}: id is required.")
        if trigger.id in seen_ids:
            raise ValueError(f"{label}: duplicate id {trigger.id!r}.")
        seen_ids.add(trigger.id)
        _zoneinfo(trigger.timezone)
        if trigger.schedule_type in ("weekly", "daily"):
            _parse_time(trigger.time)
        if trigger.schedule_type == "weekly":
            if not trigger.days_of_week:
                raise ValueError(f"{label}: select at least one weekday.")
        if trigger.schedule_type == "once":
            if not trigger.once_at:
                raise ValueError(f"{label}: custom date/time is required.")
            if trigger.enabled and not trigger.last_fired_at:
                parsed = datetime.fromisoformat(
                    trigger.once_at.replace("Z", "+00:00"),
                )
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                if parsed <= datetime.now(timezone.utc):
                    raise ValueError(f"{label}: custom date/time must be in the future.")


def load_interval_triggers() -> list[IntervalTrigger]:
    if not INTERVAL_TRIGGERS_PATH.is_file():
        return []
    try:
        payload = json.loads(INTERVAL_TRIGGERS_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Could not read interval triggers file: %s", exc)
        return []
    raw = payload.get("triggers", payload if isinstance(payload, list) else [])
    if not isinstance(raw, list):
        return []
    triggers: list[IntervalTrigger] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            triggers.append(_trigger_from_dict(item))
        except (ValueError, TypeError) as exc:
            logger.warning("Skipping invalid interval trigger: %s", exc)
    return triggers


def save_interval_triggers(triggers: list[IntervalTrigger]) -> None:
    validate_interval_triggers(triggers)
    INTERVAL_TRIGGERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"triggers": [asdict(trigger) for trigger in triggers]}
    INTERVAL_TRIGGERS_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _slot_key(trigger: IntervalTrigger, moment: datetime) -> str:
    tz = _zoneinfo(trigger.timezone)
    local = moment.astimezone(tz).replace(second=0, microsecond=0)
    if trigger.schedule_type == "once" and trigger.once_at:
        once_text = trigger.once_at.replace("Z", "+00:00")
        once_dt = datetime.fromisoformat(once_text)
        if once_dt.tzinfo is None:
            once_dt = once_dt.replace(tzinfo=timezone.utc)
        once_local = once_dt.astimezone(tz).replace(second=0, microsecond=0)
        return once_local.isoformat()
    return local.strftime("%Y-%m-%dT%H:%M")


def _already_fired_this_slot(trigger: IntervalTrigger, moment: datetime) -> bool:
    if not trigger.last_fired_at:
        return False
    return trigger.last_fired_at == _slot_key(trigger, moment)


def _is_due(trigger: IntervalTrigger, moment: datetime) -> bool:
    if not trigger.enabled:
        return False
    if _already_fired_this_slot(trigger, moment):
        return False

    tz = _zoneinfo(trigger.timezone)
    local = moment.astimezone(tz).replace(second=0, microsecond=0)

    if trigger.schedule_type == "once":
        if not trigger.once_at:
            return False
        once_text = trigger.once_at.replace("Z", "+00:00")
        once_dt = datetime.fromisoformat(once_text)
        if once_dt.tzinfo is None:
            once_dt = once_dt.replace(tzinfo=timezone.utc)
        once_local = once_dt.astimezone(tz).replace(second=0, microsecond=0)
        return local >= once_local

    hour, minute = _parse_time(trigger.time)
    if local.hour != hour or local.minute != minute:
        return False

    if trigger.schedule_type == "daily":
        return True

    weekday = local.weekday()
    return weekday in trigger.days_of_week


def triggers_due_now(
    triggers: list[IntervalTrigger],
    *,
    now: datetime | None = None,
) -> list[IntervalTrigger]:
    moment = now or datetime.now(timezone.utc)
    return [trigger for trigger in triggers if _is_due(trigger, moment)]


def mark_triggers_fired(
    trigger_ids: list[str],
    *,
    now: datetime | None = None,
) -> None:
    if not trigger_ids:
        return
    moment = now or datetime.now(timezone.utc)
    triggers = load_interval_triggers()
    id_set = set(trigger_ids)
    changed = False
    for trigger in triggers:
        if trigger.id not in id_set:
            continue
        trigger.last_fired_at = _slot_key(trigger, moment)
        if trigger.schedule_type == "once":
            trigger.enabled = False
        changed = True
    if changed:
        save_interval_triggers(triggers)


def next_trigger_at(
    triggers: list[IntervalTrigger],
    *,
    now: datetime | None = None,
) -> str | None:
    """Return ISO datetime of the nearest future firing among enabled triggers."""
    moment = now or datetime.now(timezone.utc)
    candidates: list[datetime] = []

    for trigger in triggers:
        if not trigger.enabled:
            continue
        tz = _zoneinfo(trigger.timezone)
        local_now = moment.astimezone(tz)

        if trigger.schedule_type == "once" and trigger.once_at:
            once_text = trigger.once_at.replace("Z", "+00:00")
            once_dt = datetime.fromisoformat(once_text)
            if once_dt.tzinfo is None:
                once_dt = once_dt.replace(tzinfo=timezone.utc)
            if once_dt > moment and not trigger.last_fired_at:
                candidates.append(once_dt)
            continue

        hour, minute = _parse_time(trigger.time)
        for offset in range(0, 8):
            candidate_day = local_now.date() + timedelta(days=offset)
            candidate_local = datetime(
                candidate_day.year,
                candidate_day.month,
                candidate_day.day,
                hour,
                minute,
                tzinfo=tz,
            )
            if candidate_local <= local_now.replace(second=0, microsecond=0):
                continue
            if trigger.schedule_type == "weekly":
                if candidate_local.weekday() not in trigger.days_of_week:
                    continue
            candidates.append(candidate_local.astimezone(timezone.utc))

    if not candidates:
        return None
    return min(candidates).isoformat()


def interval_triggers_to_dict(triggers: list[IntervalTrigger]) -> dict[str, Any]:
    moment = datetime.now(timezone.utc)
    return {
        "triggers": [asdict(trigger) for trigger in triggers],
        "settings_path": str(INTERVAL_TRIGGERS_PATH),
        "persisted": INTERVAL_TRIGGERS_PATH.is_file(),
        "known_timezones": list(KNOWN_TIMEZONES),
        "weekday_labels": list(WEEKDAY_LABELS),
        "interval_triggers_count": len(triggers),
        "next_trigger_at": next_trigger_at(triggers, now=moment),
    }
