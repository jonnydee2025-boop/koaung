import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Plus, Trash2, X } from 'lucide-react';
import { fetchDriveMediaOptions } from '../data/api';
import MediaSelectDropdown from './MediaSelectDropdown';
import OptionSelectDropdown from './OptionSelectDropdown';
import DateTimeWheelPicker from './DateTimeWheelPicker';
import TimeWheelPicker from './TimeWheelPicker';
import ErrorBanner from './ErrorBanner';

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

const REPEAT_TYPE_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

const TIMEZONE_OPTIONS = TIMEZONES.map((tz) => ({ value: tz, label: tz }));

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

function emptyRepeatThumb() {
  return { file_id: '', name: '' };
}

function mapRepeatThumbnailsFromJob(job) {
  const items = job?.repeat?.thumbnails;
  if (!Array.isArray(items) || items.length === 0) {
    return [emptyRepeatThumb()];
  }
  return items.map((item) => ({
    file_id: item.file_id ?? '',
    name: item.name ?? '',
  }));
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
  const [repeatThumbnails, setRepeatThumbnails] = useState(() => mapRepeatThumbnailsFromJob(job));
  const [repeatBackgroundId, setRepeatBackgroundId] = useState(job?.repeat?.background_video_id || '');
  const [repeatBackgroundName, setRepeatBackgroundName] = useState(
    job?.repeat?.background_video_name || '',
  );
  const [repeatLoopCount, setRepeatLoopCount] = useState(
    job?.repeat?.background_loop_count != null && job?.repeat?.background_loop_count !== ''
      ? String(job.repeat.background_loop_count)
      : '',
  );
  const [driveThumbnails, setDriveThumbnails] = useState([]);
  const [driveBackgrounds, setDriveBackgrounds] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (open) {
      setMode(job?.status === 'repeat' || job?.repeat ? 'repeat' : 'once');
      const minNow = toLocalInputValue(new Date(Date.now() + 60 * 1000));
      const onceValue =
        job?.schedule_time && job?.status === 'scheduled'
          ? toLocalInputValue(new Date(job.schedule_time))
          : defaultOnceValue;
      setLocalValue(new Date(onceValue) < new Date(minNow) ? minNow : onceValue);
      setRepeatTime(job?.repeat?.repeat_time || '07:00');
      setRepeatType(job?.repeat?.repeat_type || 'daily');
      setTimezone(job?.repeat?.timezone || 'Asia/Yangon');
      setDaysOfWeek(
        new Set(job?.repeat?.days_of_week?.length ? job.repeat.days_of_week : [0, 1, 2, 3, 4]),
      );
      setRepeatThumbnails(mapRepeatThumbnailsFromJob(job));
      setRepeatBackgroundId(job?.repeat?.background_video_id || '');
      setRepeatBackgroundName(job?.repeat?.background_video_name || '');
      setRepeatLoopCount(
        job?.repeat?.background_loop_count != null && job?.repeat?.background_loop_count !== ''
          ? String(job.repeat.background_loop_count)
          : '',
      );
      setLocalError('');
    }
  }, [open, defaultOnceValue, job]);

  useEffect(() => {
    if (!open || mode !== 'repeat') return;
    let cancelled = false;
    setLoadingMedia(true);
    fetchDriveMediaOptions()
      .then((media) => {
        if (!cancelled) {
          setDriveThumbnails(media.thumbnail_images ?? []);
          setDriveBackgrounds(media.background_videos ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDriveThumbnails([]);
          setDriveBackgrounds([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMedia(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode]);

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

  const updateRepeatThumb = (index, patch) => {
    setRepeatThumbnails((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const addRepeatThumb = () => {
    setRepeatThumbnails((prev) => [...prev, emptyRepeatThumb()]);
  };

  const removeRepeatThumb = (index) => {
    setRepeatThumbnails((prev) =>
      prev.length <= 1 ? [emptyRepeatThumb()] : prev.filter((_, i) => i !== index),
    );
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
        const thumbs = repeatThumbnails
          .filter((item) => item.file_id)
          .map((item) => {
            const opt = driveThumbnails.find((t) => t.id === item.file_id);
            return {
              file_id: item.file_id,
              name: item.name || opt?.name || '',
            };
          });
        onSave({
          mode: 'repeat',
          repeat_type: repeatType,
          repeat_time: repeatTime,
          days_of_week: [...daysOfWeek].sort((a, b) => a - b),
          timezone,
          repeat_thumbnails: thumbs,
          background_video_id: repeatBackgroundId,
          background_video_name: repeatBackgroundName,
          background_loop_count: repeatLoopCount.trim()
            ? Number(repeatLoopCount.replace(/\D/g, ''))
            : null,
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
        className="modal-card modal-card--calm schedule-modal"
        role="dialog"
        aria-labelledby="schedule-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header schedule-modal-header">
          <div>
            <h2 id="schedule-modal-title" className="modal-title">
              Schedule Job
            </h2>
            <p className="modal-subtitle schedule-modal-subtitle">
              <span className="schedule-modal-row-ref">Row #{job.row} —</span>{' '}
              <span className="schedule-modal-job-title">{job.title || '(no title)'}</span>
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
              <div className="schedule-field">
                <label className="schedule-field-label" htmlFor="schedule-datetime">
                  Date &amp; time
                </label>
                <DateTimeWheelPicker
                  id="schedule-datetime"
                  value={localValue}
                  min={minValue}
                  disabled={saving}
                  ariaLabel="Schedule date and time"
                  onChange={setLocalValue}
                />
              </div>
              <p className="modal-hint schedule-modal-hint">
                Uses your browser timezone. Cannot overlap another scheduled or repeat time slot.
              </p>
            </>
          ) : (
            <>
              <div className="schedule-field">
                <label className="schedule-field-label" htmlFor="schedule-repeat-time">
                  Time
                </label>
                <TimeWheelPicker
                  id="schedule-repeat-time"
                  value={repeatTime}
                  disabled={saving}
                  ariaLabel="Repeat time"
                  onChange={setRepeatTime}
                />
              </div>

              <div className="schedule-field">
                <label className="schedule-field-label" htmlFor="schedule-repeat-type">
                  Pattern
                </label>
                <OptionSelectDropdown
                  id="schedule-repeat-type"
                  value={repeatType}
                  options={REPEAT_TYPE_OPTIONS}
                  disabled={saving}
                  ariaLabel="Repeat pattern"
                  onChange={setRepeatType}
                />
              </div>

              {repeatType === 'weekly' && (
                <div className="schedule-weekday-row">
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

              <div className="schedule-field">
                <label className="schedule-field-label" htmlFor="schedule-timezone">
                  Timezone
                </label>
                <OptionSelectDropdown
                  id="schedule-timezone"
                  value={timezone}
                  options={TIMEZONE_OPTIONS}
                  disabled={saving}
                  ariaLabel="Timezone"
                  onChange={setTimezone}
                />
              </div>

              <div className="schedule-repeat-media">
                <div className="schedule-field">
                  <div className="schedule-field-label">Background video</div>
                  <MediaSelectDropdown
                    id="schedule-repeat-background"
                    value={repeatBackgroundId}
                    options={driveBackgrounds}
                    disabled={saving || loadingMedia}
                    emptyLabel="— Random from Drive —"
                    searchPlaceholder="Search backgrounds…"
                    onChange={(id, opt) => {
                      setRepeatBackgroundId(id);
                      setRepeatBackgroundName(opt?.name ?? '');
                    }}
                  />
                </div>
                <div className="schedule-field">
                  <label className="schedule-field-label" htmlFor="schedule-repeat-loops">
                    Background loops
                  </label>
                  <input
                    id="schedule-repeat-loops"
                    className="login-input schedule-field-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Auto"
                    value={repeatLoopCount}
                    onChange={(e) => setRepeatLoopCount(e.target.value.replace(/\D/g, ''))}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="schedule-repeat-thumbs">
                <div className="schedule-field-label">Repeat thumbnails (in order)</div>
                {repeatThumbnails.map((thumb, index) => (
                  <div key={index} className="schedule-repeat-thumb-row">
                    <span className="schedule-repeat-thumb-index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <MediaSelectDropdown
                      id={`schedule-repeat-thumb-${index}`}
                      className="schedule-repeat-thumb-dropdown"
                      value={thumb.file_id}
                      options={driveThumbnails}
                      disabled={saving || loadingMedia}
                      emptyLabel="— None —"
                      searchPlaceholder="Search thumbnails…"
                      onChange={(id, opt) => {
                        updateRepeatThumb(index, {
                          file_id: id,
                          name: opt?.name ?? '',
                        });
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm job-action-btn schedule-repeat-thumb-remove"
                      onClick={() => removeRepeatThumb(index)}
                      disabled={saving}
                      aria-label={`Remove thumbnail ${index + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm schedule-add-thumb-btn"
                  onClick={addRepeatThumb}
                  disabled={saving || loadingMedia}
                >
                  <Plus size={14} /> Add thumbnail
                </button>
              </div>

              <p className="modal-hint schedule-modal-hint">
                Re-uploads the same track on each run. Batch jobs apply to the anchor row only.
                Cannot share a time slot with another job.
              </p>
            </>
          )}

          {displayError && <ErrorBanner message={displayError} className="error-banner--inline" />}
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
