import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import {
  FloatingDropdownMenu,
  useDropdownDismiss,
  useFloatingDropdown,
} from './FloatingDropdownMenu';

const DEFAULT_LABEL = '— Default —';

export default function MediaSelectDropdown({
  id,
  value = '',
  options = [],
  disabled = false,
  title,
  emptyLabel = DEFAULT_LABEL,
  searchPlaceholder = 'Search files…',
  className = '',
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuWidth, setMenuWidth] = useState(null);
  const anchorRef = useRef(null);
  const { menuRef, coords, updatePosition } = useFloatingDropdown(open, anchorRef);
  useDropdownDismiss(open, setOpen, anchorRef, menuRef);

  const selected = useMemo(
    () => options.find((opt) => opt.id === value),
    [options, value],
  );

  const displayLabel = selected?.name?.trim() || emptyLabel;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return options;
    }
    return options.filter((opt) => opt.name?.toLowerCase().includes(needle));
  }, [options, query]);

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
  }, [open, filtered.length, query, updatePosition]);

  const handleToggle = () => {
    if (disabled) {
      return;
    }
    setQuery('');
    setOpen((current) => !current);
  };

  const handleSelect = (nextId, option) => {
    onChange?.(nextId, option);
    setOpen(false);
    setQuery('');
  };

  return (
    <div
      className={`media-select-dropdown${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
    >
      <button
        id={id}
        ref={anchorRef}
        type="button"
        className="media-select-dropdown-trigger form-input"
        disabled={disabled}
        title={title ?? (selected?.name || emptyLabel)}
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
        className="media-select-dropdown-menu"
        ariaLabel="Select media file"
        width={menuWidth}
      >
        {options.length > 4 && (
          <div className="media-select-dropdown-search">
            <Search size={14} aria-hidden />
            <input
              type="search"
              className="media-select-dropdown-search-input"
              placeholder={searchPlaceholder}
              value={query}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        )}

        <button
          type="button"
          role="option"
          aria-selected={!value}
          className={`media-select-dropdown-item${!value ? ' is-active' : ''}`}
          onClick={() => handleSelect('', null)}
        >
          <span className="media-select-dropdown-item-label">{emptyLabel}</span>
          {!value && <Check size={14} className="media-select-dropdown-check" aria-hidden />}
        </button>

        {filtered.length === 0 ? (
          <p className="media-select-dropdown-empty">No matching files</p>
        ) : (
          filtered.map((opt) => {
            const isActive = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`media-select-dropdown-item${isActive ? ' is-active' : ''}`}
                title={opt.name}
                onClick={() => handleSelect(opt.id, opt)}
              >
                <span className="media-select-dropdown-item-label">{opt.name}</span>
                {isActive && (
                  <Check size={14} className="media-select-dropdown-check" aria-hidden />
                )}
              </button>
            );
          })
        )}
      </FloatingDropdownMenu>
    </div>
  );
}
