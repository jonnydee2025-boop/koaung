import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  FloatingDropdownMenu,
  useDropdownDismiss,
  useFloatingDropdown,
} from './FloatingDropdownMenu';
import {
  WheelColumn,
  formatTime12,
  parseTime24,
  toTime24,
} from './TimeWheelPicker';

const MONTH_ITEMS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
];

const HOUR_ITEMS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

const MINUTE_ITEMS = Array.from({ length: 60 }, (_, minute) => ({
  value: minute,
  label: String(minute).padStart(2, '0'),
}));

const PERIOD_ITEMS = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function parseLocalDateTime(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    const fallback = new Date(Date.now() + 60 * 60 * 1000);
    fallback.setSeconds(0, 0);
    return parseLocalDateTime(toLocalDateTimeValue(fallback));
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour24 = Number(match[4]);
  const minute = Number(match[5]);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour24) ||
    Number.isNaN(minute)
  ) {
    const fallback = new Date(Date.now() + 60 * 60 * 1000);
    fallback.setSeconds(0, 0);
    return parseLocalDateTime(toLocalDateTimeValue(fallback));
  }

  const maxDay = daysInMonth(year, month);
  const safeDay = Math.min(Math.max(1, day), maxDay);
  const timeParts = parseTime24(`${pad2(hour24)}:${pad2(minute)}`);

  return {
    year,
    month,
    day: safeDay,
    hour24,
    minute,
    ...timeParts,
  };
}

export function toLocalDateTimeValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function buildLocalDateTime({ year, month, day, hour24, minute }) {
  const maxDay = daysInMonth(year, month);
  const safeDay = Math.min(Math.max(1, day), maxDay);
  return `${year}-${pad2(month)}-${pad2(safeDay)}T${pad2(hour24)}:${pad2(minute)}`;
}

function clampLocalDateTime(value, min) {
  if (!min) {
    return value;
  }
  const parsed = new Date(value);
  const minParsed = new Date(min);
  if (Number.isNaN(parsed.getTime()) || Number.isNaN(minParsed.getTime())) {
    return value;
  }
  return parsed.getTime() < minParsed.getTime() ? min : value;
}

function formatDisplay(value) {
  const parts = parseLocalDateTime(value);
  const date = new Date(parts.year, parts.month - 1, parts.day, parts.hour24, parts.minute);
  const dateLabel = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${dateLabel} · ${formatTime12(`${pad2(parts.hour24)}:${pad2(parts.minute)}`)}`;
}

function buildYearItems(minValue) {
  const minYear = parseLocalDateTime(minValue).year;
  return Array.from({ length: 3 }, (_, index) => {
    const year = minYear + index;
    return { value: year, label: String(year) };
  });
}

export default function DateTimeWheelPicker({
  id,
  value,
  min,
  disabled = false,
  onChange,
  className = '',
  ariaLabel = 'Select date and time',
}) {
  const [open, setOpen] = useState(false);
  const [menuWidth, setMenuWidth] = useState(null);
  const anchorRef = useRef(null);
  const { menuRef, coords, updatePosition } = useFloatingDropdown(open, anchorRef);
  useDropdownDismiss(open, setOpen, anchorRef, menuRef);

  const parts = useMemo(() => parseLocalDateTime(value), [value]);
  const displayLabel = useMemo(() => formatDisplay(value), [value]);
  const yearItems = useMemo(() => buildYearItems(min || value), [min, value]);

  const dayItems = useMemo(
    () =>
      Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, index) => {
        const day = index + 1;
        return { value: day, label: String(day) };
      }),
    [parts.year, parts.month],
  );

  useEffect(() => {
    if (!open) {
      setMenuWidth(null);
      return;
    }
    const width = anchorRef.current?.getBoundingClientRect().width;
    if (width) {
      setMenuWidth(Math.max(Math.round(width), 320));
    }
    updatePosition();
  }, [open, updatePosition]);

  const emitChange = (patch) => {
    let hour24 = parts.hour24;
    let minute = parts.minute;

    if (patch.hour12 != null || patch.minute != null || patch.period != null) {
      const time24 = toTime24(
        patch.hour12 ?? parts.hour12,
        patch.minute ?? parts.minute,
        patch.period ?? parts.period,
      );
      [hour24, minute] = time24.split(':').map(Number);
    }

    const next = clampLocalDateTime(
      buildLocalDateTime({
        year: patch.year ?? parts.year,
        month: patch.month ?? parts.month,
        day: patch.day ?? parts.day,
        hour24,
        minute,
      }),
      min,
    );
    onChange?.(next);
  };

  const handleToggle = () => {
    if (disabled) {
      return;
    }
    setOpen((current) => !current);
  };

  return (
    <div
      className={`datetime-wheel-picker time-wheel-picker media-select-dropdown option-select-dropdown${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''} ${className}`.trim()}
    >
      <button
        id={id}
        ref={anchorRef}
        type="button"
        className="media-select-dropdown-trigger form-input"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={handleToggle}
      >
        <span className="media-select-dropdown-label">{displayLabel}</span>
        <ChevronDown size={14} className="media-select-dropdown-chevron" aria-hidden />
      </button>

      <FloatingDropdownMenu
        open={open && !disabled}
        anchorRef={anchorRef}
        menuRef={menuRef}
        coords={coords}
        className="media-select-dropdown-menu datetime-wheel-panel"
        ariaLabel={ariaLabel}
        role="dialog"
        width={menuWidth}
      >
        <div className="datetime-wheel-row">
          <div className="time-wheel-highlight" aria-hidden />
          <WheelColumn
            items={MONTH_ITEMS}
            value={parts.month}
            disabled={disabled}
            ariaLabel="Month"
            onChange={(month) => emitChange({ month })}
          />
          <WheelColumn
            items={dayItems}
            value={parts.day}
            disabled={disabled}
            ariaLabel="Day"
            onChange={(day) => emitChange({ day })}
          />
          <WheelColumn
            items={yearItems}
            value={parts.year}
            disabled={disabled}
            ariaLabel="Year"
            onChange={(year) => emitChange({ year })}
          />
        </div>
        <div className="datetime-wheel-row">
          <div className="time-wheel-highlight" aria-hidden />
          <WheelColumn
            items={HOUR_ITEMS}
            value={parts.hour12}
            disabled={disabled}
            ariaLabel="Hour"
            onChange={(hour12) => emitChange({ hour12 })}
          />
          <WheelColumn
            items={MINUTE_ITEMS}
            value={parts.minute}
            disabled={disabled}
            ariaLabel="Minute"
            onChange={(minute) => emitChange({ minute })}
          />
          <WheelColumn
            items={PERIOD_ITEMS}
            value={parts.period}
            disabled={disabled}
            ariaLabel="AM or PM"
            onChange={(period) => emitChange({ period })}
          />
        </div>
      </FloatingDropdownMenu>
    </div>
  );
}
