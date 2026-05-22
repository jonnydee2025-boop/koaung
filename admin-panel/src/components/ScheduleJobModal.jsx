import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';

/** datetime-local value (local timezone) from a Date. */
function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Convert datetime-local string to ISO 8601 for the API. */
export function localInputToIso(localValue) {
  if (!localValue) return '';
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date and time.');
  }
  return parsed.toISOString();
}

export default function ScheduleJobModal({
  job,
  open,
  saving,
  error,
  onClose,
  onSave,
}) {
  const defaultValue = useMemo(() => {
    const next = new Date(Date.now() + 60 * 60 * 1000);
    next.setSeconds(0, 0);
    return toLocalInputValue(next);
  }, [open, job?.row]);

  const [localValue, setLocalValue] = useState(defaultValue);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (open) {
      setLocalValue(defaultValue);
      setLocalError('');
    }
  }, [open, defaultValue]);

  if (!open || !job) {
    return null;
  }

  const minValue = toLocalInputValue(new Date(Date.now() + 60 * 1000));

  const handleSubmit = (e) => {
    e.preventDefault();
    setLocalError('');
    try {
      onSave(localInputToIso(localValue));
    } catch (err) {
      setLocalError(err.message || 'Invalid date and time.');
    }
  };

  const displayError = error || localError;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-labelledby="schedule-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="schedule-modal-title" className="modal-title">
              Schedule job
            </h2>
            <p className="modal-subtitle">
              Row #{job.row} — {job.title || '(no title)'}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="login-label" htmlFor="schedule-datetime">
            Date &amp; time
          </label>
          <input
            id="schedule-datetime"
            className="login-input"
            type="datetime-local"
            value={localValue}
            min={minValue}
            onChange={(e) => setLocalValue(e.target.value)}
            disabled={saving}
            required
          />
          <p className="modal-hint">
            Uses your browser timezone. The same date &amp; time cannot be assigned to two jobs.
          </p>
          {displayError && <p className="login-error">{displayError}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <CalendarClock size={14} />
              {saving ? 'Saving…' : 'Save schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
