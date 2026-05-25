import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  EDITABLE_STATUS_OPTIONS,
  selectStatusValue,
  statusThemeFor,
} from '../data/statusTheme';
import {
  FloatingDropdownMenu,
  isOutsideFloatingDropdown,
  useFloatingDropdown,
} from './FloatingDropdownMenu';

export default function JobStatusSelect({
  status,
  disabled = false,
  saving = false,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const isProcessing = status === 'processing';
  const value = selectStatusValue(status);
  const triggerTheme = statusThemeFor(status);
  const isLocked = isProcessing || disabled || saving;
  const { menuRef, coords } = useFloatingDropdown(open, anchorRef);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (isOutsideFloatingDropdown(event, anchorRef, menuRef)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, menuRef]);

  const handleSelect = (next) => {
    if (next && next !== value) {
      onChange?.(next);
    }
    setOpen(false);
  };

  return (
    <div
      className={`status-dropdown${open ? ' is-open' : ''}${isLocked ? ' is-locked' : ''}`}
    >
      <button
        ref={anchorRef}
        type="button"
        className={`status-dropdown-trigger badge ${triggerTheme.badgeClass}`}
        disabled={isLocked}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change status"
        onClick={() => {
          if (!isLocked) {
            setOpen((current) => !current);
          }
        }}
      >
        <span className="badge-dot" />
        <span>{triggerTheme.label}</span>
        {!isLocked && <ChevronDown size={12} className="status-dropdown-chevron" />}
      </button>

      <FloatingDropdownMenu
        open={open && !isLocked}
        anchorRef={anchorRef}
        menuRef={menuRef}
        coords={coords}
        className="status-dropdown-menu"
        ariaLabel="Status options"
      >
        {EDITABLE_STATUS_OPTIONS.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={isActive}
              className={`toolbar-dropdown-item badge ${option.badgeClass}${isActive ? ' is-active' : ''}`}
              onClick={() => handleSelect(option.value)}
            >
              <span className="badge-dot" />
              <span>{option.label}</span>
              {isActive && <Check size={12} className="toolbar-dropdown-check" />}
            </button>
          );
        })}
      </FloatingDropdownMenu>
    </div>
  );
}
