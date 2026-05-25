import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useMobileNav } from '../context/MobileNavContext';
import {
  FloatingDropdownMenu,
  useDropdownDismiss,
  useFloatingDropdown,
} from './FloatingDropdownMenu';

export default function MonkFilterTab({ value, options, onChange, statusFilter }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const { closeSidebar, sidebarOpen } = useMobileNav();
  const isActive = Boolean(value);
  const { menuRef, coords } = useFloatingDropdown(open, anchorRef);
  useDropdownDismiss(open, setOpen, anchorRef, menuRef);

  useEffect(() => {
    if (open && sidebarOpen) {
      closeSidebar();
    }
  }, [open, sidebarOpen, closeSidebar]);

  useEffect(() => {
    setOpen(false);
  }, [statusFilter]);

  const handleSelect = (next) => {
    onChange?.(next);
    setOpen(false);
  };

  return (
    <div className={`monk-filter-dropdown jobs-filter-dropdown${open ? ' is-open' : ''}`}>
      <button
        ref={anchorRef}
        type="button"
        id="job-monk-filter"
        className={`btn btn-ghost btn-sm jobs-filter-tab${isActive ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by monk"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          closeSidebar();
          setOpen((current) => !current);
        }}
      >
        Monks 🔽
        {isActive && (
          <span className="jobs-filter-count jobs-filter-count-accent" title={value}>
            {value.length > 14 ? `${value.slice(0, 12)}…` : value}
          </span>
        )}
        {!isActive && options.length > 0 && (
          <span className="jobs-filter-count">{options.length}</span>
        )}
      </button>

      <FloatingDropdownMenu
        open={open}
        anchorRef={anchorRef}
        menuRef={menuRef}
        coords={coords}
        className="monk-filter-menu"
        ariaLabel="Monk options"
      >
        <button
          type="button"
          role="option"
          aria-selected={!value}
          className={`toolbar-dropdown-item badge badge-muted${!value ? ' is-active' : ''}`}
          onClick={() => handleSelect('')}
        >
          <span className="badge-dot" />
          <span>All monks</span>
          {!value && <Check size={12} className="toolbar-dropdown-check" />}
        </button>
        {options.length === 0 ? (
          <p className="toolbar-dropdown-empty">No monks in sheet</p>
        ) : (
          options.map((name) => {
            const selected = value === name;
            return (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={selected}
                className={`toolbar-dropdown-item badge badge-accent${selected ? ' is-active' : ''}`}
                onClick={() => handleSelect(name)}
              >
                <span className="badge-dot" />
                <span className="toolbar-dropdown-item-label">{name}</span>
                {selected && <Check size={12} className="toolbar-dropdown-check" />}
              </button>
            );
          })
        )}
      </FloatingDropdownMenu>
    </div>
  );
}
