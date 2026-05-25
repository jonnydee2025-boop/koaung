import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  EDITABLE_STATUS_OPTIONS,
  selectStatusValue,
  statusThemeFor,
} from '../data/statusTheme';
import { useMobileNav } from '../context/MobileNavContext';
import {
  FloatingDropdownMenu,
  useDropdownDismiss,
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
  const { closeSidebar, sidebarOpen } = useMobileNav();
  const isProcessing = status === 'processing';
  const value = selectStatusValue(status);
  const triggerTheme = statusThemeFor(status);
  const isLocked = isProcessing || disabled || saving;
  const { menuRef, coords } = useFloatingDropdown(open, anchorRef);
  useDropdownDismiss(open, setOpen, anchorRef, menuRef);

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
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          if (!isLocked) {
            closeSidebar();
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
