import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

export default function CollapsibleSearch({
  value,
  onChange,
  placeholder = 'Search title…',
  id = 'job-search',
}) {
  const [open, setOpen] = useState(Boolean(value.trim()));
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (value.trim()) {
      setOpen(true);
    }
  }, [value]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        if (!value.trim()) {
          setOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open, value]);

  const handleToggle = () => {
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleBlur = () => {
    if (!value.trim()) {
      setOpen(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (value.trim()) {
        onChange('');
      } else {
        setOpen(false);
      }
      event.preventDefault();
    }
  };

  return (
    <div
      ref={rootRef}
      className={`collapsible-search${open ? ' is-open' : ''}`}
    >
      {!open && (
        <button
          type="button"
          className="btn btn-ghost btn-sm collapsible-search-toggle"
          onClick={handleToggle}
          aria-label="Search jobs"
          aria-expanded={false}
        >
          <Search size={14} />
        </button>
      )}
      <div className="collapsible-search-input-wrap">
        <Search size={13} className="collapsible-search-icon" aria-hidden />
        <input
          ref={inputRef}
          id={id}
          className="form-input collapsible-search-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          aria-expanded={open}
          aria-label="Search jobs by title"
        />
      </div>
    </div>
  );
}
