import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import Skeleton from './Skeleton';
import { useLazyVisible } from '../hooks/useLazyVisible';
import { useSheetCacheInvalidation } from '../hooks/useSheetCacheInvalidation';
import {
  prefetchAdjacentCalendarMonths,
  useCalendarEvents,
} from '../hooks/useSheetData';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_CHIPS = 3;

const KIND_META = {
  scheduled: { label: 'Scheduled', color: 'var(--blue)', className: 'scheduled' },
  repeat: { label: 'Repeat', color: '#a78bfa', className: 'repeat' },
  do: { label: 'Priority', color: '#f59e0b', className: 'do' },
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatMonthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function dateKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function isoDateKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildMonthCells(year, month) {
  const first = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const startOffset = (first.getDay() + 6) % 7;
  const cells = [];

  for (let i = 0; i < startOffset; i += 1) {
    cells.push({ day: null, inMonth: false });
  }
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push({ day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, inMonth: false });
  }
  return cells;
}

function EventChip({ event, onSelect }) {
  const meta = KIND_META[event.kind] || KIND_META.scheduled;
  const label = event.title || event.label || meta.label;
  return (
    <button
      type="button"
      className={`content-calendar-event-chip ${meta.className}`}
      title={`${meta.label}: ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(event);
      }}
    >
      <span className="content-calendar-event-time">{formatTime(event.at)}</span>
      <span className="content-calendar-event-title">{label}</span>
    </button>
  );
}

function EventDetail({ event, onClose }) {
  const meta = KIND_META[event.kind] || KIND_META.scheduled;
  return (
    <div className="content-calendar-popover">
      <div className="content-calendar-popover-header">
        <span className={`content-calendar-kind-badge ${meta.className}`}>{meta.label}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="content-calendar-popover-body">
        <div className="content-calendar-popover-row">
          <span className="content-calendar-popover-label">Time</span>
          <span>{new Date(event.at).toLocaleString()}</span>
        </div>
        <div className="content-calendar-popover-row">
          <span className="content-calendar-popover-label">Title</span>
          <span>{event.title || event.label || '—'}</span>
        </div>
        {event.monk ? (
          <div className="content-calendar-popover-row">
            <span className="content-calendar-popover-label">Monk</span>
            <span>{event.monk}</span>
          </div>
        ) : null}
        {event.row != null ? (
          <div className="content-calendar-popover-row">
            <span className="content-calendar-popover-label">Row</span>
            <Link to="/jobs" className="content-calendar-row-link">
              #{event.row}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CalendarGridSkeleton() {
  return (
    <div className="content-calendar-grid content-calendar-grid--loading" aria-hidden="true">
      {WEEKDAYS.map((label) => (
        <div key={label} className="content-calendar-weekday">
          {label}
        </div>
      ))}
      {Array.from({ length: 35 }).map((_, index) => (
        <div key={index} className="content-calendar-day content-calendar-day-skeleton">
          <Skeleton h={14} w={18} />
          <Skeleton h={18} w="70%" />
        </div>
      ))}
    </div>
  );
}

export default function ContentCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const { ref: rootRef, isVisible } = useLazyVisible({ rootMargin: '160px', initialVisible: true });

  const calendarQuery = useCalendarEvents(year, month, { enabled: isVisible });
  const {
    data,
    loading,
    refreshing,
    error,
    refresh,
  } = calendarQuery;

  useEffect(() => {
    if (!isVisible) return undefined;
    prefetchAdjacentCalendarMonths(year, month);
  }, [year, month, isVisible]);

  useSheetCacheInvalidation(refresh);

  const events = useMemo(
    () => (Array.isArray(data?.events) ? data.events : []),
    [data],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const event of events) {
      const key = isoDateKey(event.at);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => buildMonthCells(year, month), [year, month]);
  const todayKey = dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const shiftMonth = (delta) => {
    const date = new Date(year, month - 1 + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
    setSelectedDay(null);
    setSelectedEvent(null);
  };

  const selectedDayEvents = selectedDay ? eventsByDay.get(selectedDay) || [] : [];
  const monthLoading = isVisible && loading && events.length === 0;
  const showInitialLoad = !isVisible || monthLoading;
  const isBusy = loading || refreshing;

  return (
    <div ref={rootRef} className="card content-calendar-card">
      <div className="card-header">
        <div>
          <div className="card-title">Content Calendar</div>
          <div className="card-subtitle">Scheduled jobs, repeat schedules, and priority queue jobs</div>
        </div>
        <div className="content-calendar-header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={refresh}
            disabled={!isVisible || isBusy}
          >
            <RefreshCw size={12} className={isBusy ? 'content-calendar-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="content-calendar-toolbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <div className="content-calendar-month-label">
          <span>{formatMonthLabel(year, month)}</span>
          {monthLoading ? (
            <span className="content-calendar-month-status" role="status" aria-live="polite">
              <Loader2 size={12} className="settings-tab-status-icon" aria-hidden="true" />
              Loading month…
            </span>
          ) : null}
          {!monthLoading && refreshing ? (
            <span className="content-calendar-month-status content-calendar-month-status--refresh" role="status">
              Updating…
            </span>
          ) : null}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="content-calendar-legend">
        {Object.entries(KIND_META).map(([kind, meta]) => (
          <span key={kind} className="content-calendar-legend-item">
            <span className={`content-calendar-legend-dot ${meta.className}`} />
            {meta.label}
          </span>
        ))}
      </div>

      {error ? <div className="content-calendar-error">{error}</div> : null}

      {showInitialLoad ? (
        <CalendarGridSkeleton />
      ) : (
        <div className={`content-calendar-grid${refreshing ? ' content-calendar-grid--refreshing' : ''}`}>
          {WEEKDAYS.map((label) => (
            <div key={label} className="content-calendar-weekday">
              {label}
            </div>
          ))}

          {cells.map((cell, index) => {
            if (!cell.inMonth || cell.day == null) {
              return <div key={`empty-${index}`} className="content-calendar-day content-calendar-day-outside" />;
            }

            const key = dateKey(year, month, cell.day);
            const dayEvents = eventsByDay.get(key) || [];
            const isToday = key === todayKey;
            const isSelected = selectedDay === key;

            return (
              <button
                key={key}
                type="button"
                className={`content-calendar-day${isToday ? ' content-calendar-day-today' : ''}${isSelected ? ' content-calendar-day-selected' : ''}`}
                onClick={() => {
                  setSelectedDay(key);
                  setSelectedEvent(null);
                }}
              >
                <div className="content-calendar-day-number">{cell.day}</div>
                <div className="content-calendar-day-events">
                  {dayEvents.slice(0, MAX_CHIPS).map((event, eventIndex) => (
                    <EventChip
                      key={`${event.at}-${event.row ?? event.label}-${eventIndex}`}
                      event={event}
                      onSelect={setSelectedEvent}
                    />
                  ))}
                  {dayEvents.length > MAX_CHIPS ? (
                    <span className="content-calendar-more">+{dayEvents.length - MAX_CHIPS} more</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {isVisible && !monthLoading && refreshing && events.length > 0 ? (
        <div className="lazy-load-meta content-calendar-cache-meta">
          Showing cached events — refreshing this month…
        </div>
      ) : null}

      {selectedEvent ? (
        <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      ) : selectedDay && selectedDayEvents.length > 0 ? (
        <div className="content-calendar-day-panel">
          <div className="content-calendar-day-panel-header">
            <span>{new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedDay(null)}>
              Close
            </button>
          </div>
          <div className="content-calendar-day-panel-list">
            {selectedDayEvents.map((event, index) => (
              <button
                key={`${event.at}-${event.row ?? event.label}-${index}`}
                type="button"
                className="content-calendar-day-panel-item"
                onClick={() => setSelectedEvent(event)}
              >
                <span className={`content-calendar-kind-badge ${(KIND_META[event.kind] || KIND_META.scheduled).className}`}>
                  {(KIND_META[event.kind] || KIND_META.scheduled).label}
                </span>
                <span className="content-calendar-day-panel-time">{formatTime(event.at)}</span>
                <span className="content-calendar-day-panel-title">{event.title || event.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
