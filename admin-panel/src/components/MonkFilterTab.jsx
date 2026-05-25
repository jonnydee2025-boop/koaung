import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

export default function MonkFilterTab({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const isActive = Boolean(value);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
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
  }, [open]);

  const handleSelect = (next) => {
    onChange?.(next);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`monk-filter-dropdown jobs-filter-dropdown${open ? ' is-open' : ''}`}
    >
      <button
        type="button"
        id="job-monk-filter"
        className={`btn btn-ghost btn-sm jobs-filter-tab${isActive ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by monk"
        onClick={() => setOpen((current) => !current)}
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

      {open && (
        <div className="toolbar-dropdown-menu monk-filter-menu" role="listbox" aria-label="Monk options">
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
        </div>
      )}
    </div>
  );
}
