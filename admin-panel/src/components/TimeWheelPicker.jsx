import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  FloatingDropdownMenu,
  useDropdownDismiss,
  useFloatingDropdown,
} from './FloatingDropdownMenu';

const ITEM_HEIGHT = 36;

const HOUR_ITEMS = Array.from({ length: 12 }, (_, i) => {
  const hour12 = i + 1;
  return { value: hour12, label: String(hour12) };
});

const MINUTE_ITEMS = Array.from({ length: 60 }, (_, minute) => ({
  value: minute,
  label: String(minute).padStart(2, '0'),
}));

const PERIOD_ITEMS = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];

export function formatTime12(value) {
  const { hour12, minute, period } = parseTime24(value);
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

export function parseTime24(value) {
  const [hourPart, minutePart = '00'] = String(value || '07:00').split(':');
  const hour24 = Number(hourPart);
  const minute = Number(minutePart);
  if (Number.isNaN(hour24) || Number.isNaN(minute)) {
    return { hour12: 7, minute: 0, period: 'AM' };
  }
  const period = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 || 12;
  return { hour12, minute, period };
}

export function toTime24(hour12, minute, period) {
  let hour24 = hour12 % 12;
  if (period === 'PM') {
    hour24 += 12;
  }
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function WheelColumn({ items, value, disabled, onChange, ariaLabel }) {
  const listRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const skipScrollRef = useRef(false);

  const scrollToValue = useCallback(
    (nextValue, smooth = false) => {
      const list = listRef.current;
      if (!list) {
        return;
      }
      const index = items.findIndex((item) => item.value === nextValue);
      if (index < 0) {
        return;
      }
      skipScrollRef.current = true;
      list.scrollTo({
        top: index * ITEM_HEIGHT,
        behavior: smooth ? 'smooth' : 'auto',
      });
      window.setTimeout(() => {
        skipScrollRef.current = false;
      }, smooth ? 180 : 0);
    },
    [items],
  );

  useEffect(() => {
    scrollToValue(value);
  }, [value, scrollToValue]);

  const handleScroll = () => {
    if (skipScrollRef.current || disabled) {
      return;
    }
    window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => {
      const list = listRef.current;
      if (!list) {
        return;
      }
      const index = Math.max(
        0,
        Math.min(items.length - 1, Math.round(list.scrollTop / ITEM_HEIGHT)),
      );
      const next = items[index]?.value;
      if (next != null && next !== value) {
        onChange(next);
      } else {
        scrollToValue(value);
      }
    }, 80);
  };

  useEffect(
    () => () => {
      window.clearTimeout(scrollTimerRef.current);
    },
    [],
  );

  return (
    <div
      ref={listRef}
      className="time-wheel-column"
      role="listbox"
      aria-label={ariaLabel}
      onScroll={handleScroll}
    >
      <div className="time-wheel-spacer" aria-hidden />
      {items.map((item) => {
        const isSelected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="option"
            aria-selected={isSelected}
            className={`time-wheel-item${isSelected ? ' is-selected' : ''}`}
            disabled={disabled}
            onClick={() => {
              onChange(item.value);
              scrollToValue(item.value, true);
            }}
          >
            {item.label}
          </button>
        );
      })}
      <div className="time-wheel-spacer" aria-hidden />
    </div>
  );
}

export default function TimeWheelPicker({
  id,
  value = '07:00',
  disabled = false,
  onChange,
  className = '',
  ariaLabel = 'Select time',
}) {
  const [open, setOpen] = useState(false);
  const [menuWidth, setMenuWidth] = useState(null);
  const anchorRef = useRef(null);
  const { menuRef, coords, updatePosition } = useFloatingDropdown(open, anchorRef);
  useDropdownDismiss(open, setOpen, anchorRef, menuRef);

  const parts = useMemo(() => parseTime24(value), [value]);
  const displayLabel = formatTime12(value);

  useEffect(() => {
    if (!open) {
      setMenuWidth(null);
      return;
    }
    const width = anchorRef.current?.getBoundingClientRect().width;
    if (width) {
      setMenuWidth(Math.max(Math.round(width), 280));
    }
    updatePosition();
  }, [open, updatePosition]);

  const emitChange = (patch) => {
    const next = {
      hour12: patch.hour12 ?? parts.hour12,
      minute: patch.minute ?? parts.minute,
      period: patch.period ?? parts.period,
    };
    onChange?.(toTime24(next.hour12, next.minute, next.period));
  };

  const handleToggle = () => {
    if (disabled) {
      return;
    }
    setOpen((current) => !current);
  };

  return (
    <div
      className={`time-wheel-picker media-select-dropdown option-select-dropdown${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''} ${className}`.trim()}
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
        className="media-select-dropdown-menu time-wheel-panel"
        ariaLabel={ariaLabel}
        role="dialog"
        width={menuWidth}
      >
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
      </FloatingDropdownMenu>
    </div>
  );
}
