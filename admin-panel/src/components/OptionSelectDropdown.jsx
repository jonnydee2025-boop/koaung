import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  FloatingDropdownMenu,
  useDropdownDismiss,
  useFloatingDropdown,
} from './FloatingDropdownMenu';

export default function OptionSelectDropdown({
  id,
  value,
  options = [],
  disabled = false,
  onChange,
  emptyLabel = '— Select —',
  allowEmpty = false,
  className = '',
  ariaLabel = 'Select option',
}) {
  const [open, setOpen] = useState(false);
  const [menuWidth, setMenuWidth] = useState(null);
  const anchorRef = useRef(null);
  const { menuRef, coords, updatePosition } = useFloatingDropdown(open, anchorRef);
  useDropdownDismiss(open, setOpen, anchorRef, menuRef);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const displayLabel = selected?.label ?? (allowEmpty ? emptyLabel : options[0]?.label ?? emptyLabel);

  useEffect(() => {
    if (!open) {
      setMenuWidth(null);
      return;
    }
    const width = anchorRef.current?.getBoundingClientRect().width;
    if (width) {
      setMenuWidth(Math.round(width));
    }
    updatePosition();
  }, [open, options.length, updatePosition]);

  const handleToggle = () => {
    if (disabled) {
      return;
    }
    setOpen((current) => !current);
  };

  const handleSelect = (nextValue) => {
    onChange?.(nextValue);
    setOpen(false);
  };

  return (
    <div
      className={`media-select-dropdown option-select-dropdown${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''} ${className}`.trim()}
    >
      <button
        id={id}
        ref={anchorRef}
        type="button"
        className="media-select-dropdown-trigger form-input"
        disabled={disabled}
        aria-haspopup="listbox"
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
        className="media-select-dropdown-menu option-select-dropdown-menu"
        ariaLabel={ariaLabel}
        width={menuWidth}
      >
        {allowEmpty && (
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={`media-select-dropdown-item${!value ? ' is-active' : ''}`}
            onClick={() => handleSelect('')}
          >
            <span className="media-select-dropdown-item-label">{emptyLabel}</span>
            {!value && <Check size={14} className="media-select-dropdown-check" aria-hidden />}
          </button>
        )}
        {options.map((opt) => {
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={isActive}
              className={`media-select-dropdown-item${isActive ? ' is-active' : ''}`}
              onClick={() => handleSelect(opt.value)}
            >
              <span className="media-select-dropdown-item-label">{opt.label}</span>
              {isActive && (
                <Check size={14} className="media-select-dropdown-check" aria-hidden />
              )}
            </button>
          );
        })}
      </FloatingDropdownMenu>
    </div>
  );
}
