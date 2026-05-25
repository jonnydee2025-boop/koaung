import { useEffect, useState } from 'react';
import { Clock, Plus, Save, Trash2 } from 'lucide-react';
import { fetchIntervalTriggers, saveIntervalTriggers } from '../data/api';

const WEEKDAYS = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
];

function newTriggerId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `trigger-${Date.now()}`;
}

function emptyTrigger() {
  return {
    id: newTriggerId(),
    name: '',
    enabled: true,
    schedule_type: 'daily',
    time: '09:00',
    days_of_week: [0, 1, 2, 3, 4],
    once_at: '',
    timezone: 'UTC',
    last_fired_at: null,
  };
}

function onceInputFromIso(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function onceInputToIso(localValue) {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid custom date/time.');
  }
  return date.toISOString();
}

export default function IntervalTriggerSettings() {
  const [triggers, setTriggers] = useState([emptyTrigger()]);
  const [knownTimezones, setKnownTimezones] = useState(['UTC']);
  const [nextTriggerAt, setNextTriggerAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetchIntervalTriggers()
      .then((data) => {
        const loaded = data.triggers?.length
          ? data.triggers.map((t) => ({
              id: t.id,
              name: t.name ?? '',
              enabled: t.enabled !== false,
              schedule_type: t.schedule_type ?? 'daily',
              time: t.time ?? '09:00',
              days_of_week: Array.isArray(t.days_of_week) ? t.days_of_week : [],
              once_at: t.once_at ?? '',
              timezone: t.timezone ?? 'UTC',
              last_fired_at: t.last_fired_at ?? null,
            }))
          : [emptyTrigger()];
        setTriggers(loaded);
        setKnownTimezones(data.known_timezones ?? ['UTC']);
        setNextTriggerAt(data.next_trigger_at ?? null);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const updateTrigger = (index, patch) => {
    setTriggers((prev) =>
      prev.map((trigger, i) => (i === index ? { ...trigger, ...patch } : trigger)),
    );
  };

  const toggleWeekday = (index, day) => {
    setTriggers((prev) =>
      prev.map((trigger, i) => {
        if (i !== index) return trigger;
        const days = new Set(trigger.days_of_week ?? []);
        if (days.has(day)) {
          days.delete(day);
        } else {
          days.add(day);
        }
        return { ...trigger, days_of_week: [...days].sort((a, b) => a - b) };
      }),
    );
  };

  const addTrigger = () => setTriggers((prev) => [...prev, emptyTrigger()]);

  const removeTrigger = (index) => {
    setTriggers((prev) =>
      prev.length <= 1 ? [emptyTrigger()] : prev.filter((_, i) => i !== index),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const payload = triggers.map((t) => {
        let onceAt = null;
        if (t.schedule_type === 'once') {
          onceAt = onceInputToIso(t.once_at);
        }
        return {
          id: t.id,
          name: t.name.trim(),
          enabled: Boolean(t.enabled),
          schedule_type: t.schedule_type,
          time: t.time || '09:00',
          days_of_week: t.schedule_type === 'weekly' ? t.days_of_week : [],
          once_at: onceAt,
          timezone: t.timezone || 'UTC',
          last_fired_at: t.last_fired_at,
        };
      });
      const result = await saveIntervalTriggers(payload);
      setNextTriggerAt(result.next_trigger_at ?? null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card settings-card interval-triggers-card">
      <div className="settings-section-header">
        <div className="settings-section-header-main">
          <div className="settings-section-title">
            <Clock size={16} className="settings-section-icon" />
            Interval Triggers (Do only)
          </div>
          <p className="settings-section-hint">
            Run the render queue for <code>do</code> rows only at set times.{' '}
            <code>scheduled</code> jobs are unchanged — they still run at their Jobs → Schedule
            time.
          </p>
          {nextTriggerAt && (
            <p className="settings-section-hint">
              Next trigger: {new Date(nextTriggerAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="settings-section-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={addTrigger}>
            <Plus size={14} />
            Add trigger
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={loading || saving}
          >
            <Save size={14} />
            {saving ? 'Saving…' : 'Save triggers'}
          </button>
        </div>
      </div>

      {error && (
        <p className="settings-feedback settings-feedback--error">
          {error}
        </p>
      )}
      {saved && (
        <p className="settings-feedback settings-feedback--success">
          Interval triggers saved.
        </p>
      )}

      {loading ? (
        <p className="settings-loading-text">
          Loading interval triggers…
        </p>
      ) : (
        <div className="interval-triggers-list">
          {triggers.map((trigger, index) => (
            <div
              key={trigger.id}
              className={`interval-trigger-row${trigger.enabled ? ' is-enabled' : ''}`}
            >
              <div className="interval-trigger-row-head">
                <label className="toggle" title="Enabled">
                  <input
                    type="checkbox"
                    checked={Boolean(trigger.enabled)}
                    onChange={(e) => updateTrigger(index, { enabled: e.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
                <input
                  className="form-input"
                  placeholder={`Trigger ${index + 1} name (optional)`}
                  value={trigger.name}
                  onChange={(e) => updateTrigger(index, { name: e.target.value })}
                />
                <select
                  className="form-input"
                  value={trigger.schedule_type}
                  onChange={(e) => updateTrigger(index, { schedule_type: e.target.value })}
                >
                  <option value="daily">Daily time</option>
                  <option value="weekly">Weekly</option>
                  <option value="once">Custom date (once)</option>
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeTrigger(index)}
                  aria-label="Remove trigger"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="interval-trigger-row-body">
                <div className="form-group">
                  <label className="form-label">Timezone</label>
                  <select
                    className="form-input"
                    value={trigger.timezone}
                    onChange={(e) => updateTrigger(index, { timezone: e.target.value })}
                  >
                    {knownTimezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>

                {trigger.schedule_type === 'weekly' && (
                  <div className="form-group">
                    <label className="form-label">Days</label>
                    <div className="interval-weekday-row">
                      {WEEKDAYS.map(({ value, label }) => (
                        <label key={value} className="interval-weekday-chip">
                          <input
                            type="checkbox"
                            checked={(trigger.days_of_week ?? []).includes(value)}
                            onChange={() => toggleWeekday(index, value)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {(trigger.schedule_type === 'weekly' || trigger.schedule_type === 'daily') && (
                  <div className="form-group">
                    <label className="form-label">Time</label>
                    <input
                      type="time"
                      className="form-input"
                      value={trigger.time}
                      onChange={(e) => updateTrigger(index, { time: e.target.value })}
                    />
                  </div>
                )}

                {trigger.schedule_type === 'once' && (
                  <div className="form-group">
                    <label className="form-label">Date & time</label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={onceInputFromIso(trigger.once_at) || trigger.once_at}
                      onChange={(e) => updateTrigger(index, { once_at: e.target.value })}
                    />
                  </div>
                )}

                {trigger.last_fired_at && (
                  <p className="interval-trigger-meta">
                    Last fired: {trigger.last_fired_at}
                    {trigger.schedule_type === 'once' && !trigger.enabled ? ' (completed)' : ''}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
