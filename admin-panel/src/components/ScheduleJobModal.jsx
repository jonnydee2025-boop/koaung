import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';

const WEEKDAYS = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
];

const TIMEZONES = [
  'UTC',
  'Asia/Yangon',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
];

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
  const defaultOnceValue = useMemo(() => {
    const next = new Date(Date.now() + 60 * 60 * 1000);
    next.setSeconds(0, 0);
    return toLocalInputValue(next);
  }, [open, job?.row]);

  const initialMode = job?.status === 'repeat' || job?.repeat ? 'repeat' : 'once';

  const [mode, setMode] = useState(initialMode);
  const [localValue, setLocalValue] = useState(defaultOnceValue);
  const [repeatTime, setRepeatTime] = useState(job?.repeat?.repeat_time || '07:00');
  const [repeatType, setRepeatType] = useState(job?.repeat?.repeat_type || 'daily');
  const [timezone, setTimezone] = useState(job?.repeat?.timezone || 'Asia/Yangon');
  const [daysOfWeek, setDaysOfWeek] = useState(
    () => new Set(job?.repeat?.days_of_week?.length ? job.repeat.days_of_week : [0, 1, 2, 3, 4]),
  );
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (open) {
      setMode(job?.status === 'repeat' || job?.repeat ? 'repeat' : 'once');
      setLocalValue(
        job?.schedule_time && job?.status === 'scheduled'
          ? toLocalInputValue(new Date(job.schedule_time))
          : defaultOnceValue,
      );
      setRepeatTime(job?.repeat?.repeat_time || '07:00');
      setRepeatType(job?.repeat?.repeat_type || 'daily');
      setTimezone(job?.repeat?.timezone || 'Asia/Yangon');
      setDaysOfWeek(
        new Set(job?.repeat?.days_of_week?.length ? job.repeat.days_of_week : [0, 1, 2, 3, 4]),
      );
      setLocalError('');
    }
  }, [open, defaultOnceValue, job]);

  if (!open || !job) {
    return null;
  }

  const minValue = toLocalInputValue(new Date(Date.now() + 60 * 1000));

  const toggleWeekday = (day) => {
    setDaysOfWeek((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLocalError('');
    try {
      if (mode === 'once') {
        onSave({
          mode: 'once',
          schedule_time: localInputToIso(localValue),
        });
      } else {
        if (repeatType === 'weekly' && daysOfWeek.size === 0) {
          throw new Error('Select at least one weekday.');
        }
        onSave({
          mode: 'repeat',
          repeat_type: repeatType,
          repeat_time: repeatTime,
          days_of_week: [...daysOfWeek].sort((a, b) => a - b),
          timezone,
        });
      }
    } catch (err) {
      setLocalError(err.message || 'Invalid schedule.');
    }
  };

  const displayError = error || localError;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card schedule-modal"
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
          <div className="schedule-mode-toggle" role="group" aria-label="Schedule mode">
            <button
              type="button"
              className={`btn btn-sm ${mode === 'once' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('once')}
              disabled={saving}
            >
              Schedule once
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'repeat' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('repeat')}
              disabled={saving}
            >
              Repeat
            </button>
          </div>

          {mode === 'once' ? (
            <>
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
                Uses your browser timezone. Cannot overlap another scheduled or repeat time slot.
              </p>
            </>
          ) : (
            <>
              <label className="login-label" htmlFor="schedule-repeat-time">
                Time
              </label>
              <input
                id="schedule-repeat-time"
                className="login-input"
                type="time"
                value={repeatTime}
                onChange={(e) => setRepeatTime(e.target.value)}
                disabled={saving}
                required
              />

              <label className="login-label" htmlFor="schedule-repeat-type" style={{ marginTop: 12 }}>
                Pattern
              </label>
              <select
                id="schedule-repeat-type"
                className="login-input"
                value={repeatType}
                onChange={(e) => setRepeatType(e.target.value)}
                disabled={saving}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>

              {repeatType === 'weekly' && (
                <div className="schedule-weekday-row" style={{ marginTop: 12 }}>
                  {WEEKDAYS.map(({ value, label }) => (
                    <label key={value} className="interval-weekday-chip">
                      <input
                        type="checkbox"
                        checked={daysOfWeek.has(value)}
                        onChange={() => toggleWeekday(value)}
                        disabled={saving}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}

              <label className="login-label" htmlFor="schedule-timezone" style={{ marginTop: 12 }}>
                Timezone
              </label>
              <select
                id="schedule-timezone"
                className="login-input"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={saving}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="modal-hint">
                Re-uploads the same track on each run. Batch jobs apply to the anchor row only.
                Cannot share a time slot with another job.
              </p>
            </>
          )}

          {displayError && <p className="login-error">{displayError}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <CalendarClock size={14} />
              {saving ? 'Saving…' : mode === 'repeat' ? 'Save repeat' : 'Save schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
