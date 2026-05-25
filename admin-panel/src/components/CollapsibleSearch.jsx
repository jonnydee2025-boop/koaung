import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

function useIsMobileSearch() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isMobile;
}

export default function CollapsibleSearch({
  value,
  onChange,
  placeholder = 'Search title…',
  id = 'job-search',
}) {
  const isMobile = useIsMobileSearch();
  const [open, setOpen] = useState(Boolean(value.trim()));
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const expanded = isMobile || open;

  useEffect(() => {
    if (value.trim()) {
      setOpen(true);
    }
  }, [value]);

  useEffect(() => {
    if (!open || isMobile) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        if (!value.trim()) {
          setOpen(false);
        }
      }
    };

    const attachTimer = window.setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown, true);
    }, 0);

    return () => {
      window.clearTimeout(attachTimer);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [open, value, isMobile]);

  const handleToggle = () => {
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleBlur = () => {
    if (isMobile || value.trim()) {
      return;
    }
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (value.trim()) {
        onChange('');
      } else if (!isMobile) {
        setOpen(false);
      }
      event.preventDefault();
    }
  };

  return (
    <div
      ref={rootRef}
      className={`collapsible-search${expanded ? ' is-open' : ''}${isMobile ? ' is-mobile' : ''}`}
    >
      {!expanded && (
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
          aria-expanded={expanded}
          aria-label="Search jobs by title"
        />
      </div>
    </div>
  );
}
