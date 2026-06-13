import { useState, useEffect, useRef, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import JobLogModal from './JobLogModal';
import Mp3PlayerModal from './Mp3PlayerModal';
import JobStatusSelect from './JobStatusSelect';
import Skeleton from './Skeleton';
import LoadingOverlay from './LoadingOverlay';
import { RotateCcw, ExternalLink, CalendarClock, NotebookText, Star } from 'lucide-react';
import { isDoneStatus, isPendingStatus } from '../data/statusTheme';
import { useJobPlayerPrefsMap } from '../hooks/useJobPlayerPrefs';

const PAGE_SIZE = 25;
const SKELETON_ROWS = 6;

function tableColSpan(showActions, columns) {
  return columns === 'full' ? (showActions ? 6 : 5) : showActions ? 5 : 4;
}

function JobsTableSkeleton({ showActions, columns }) {
  const colSpan = tableColSpan(showActions, columns);
  return (
    <table className="jobs-table-skeleton">
      <thead>
        <tr>
          <th>Title</th>
          <th>Row</th>
          <th>Status</th>
          <th>YouTube</th>
          <th>Log</th>
          {showActions && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <tr key={i}>
            <td colSpan={colSpan}>
              <Skeleton h={16} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function LazyJobTable({
  jobs,
  initialLoading = false,
  overlayLoading = false,
  filtered,
  onRetry,
  onStatusChange,
  onSchedule,
  updatingStatusRow = null,
  retryingRow = null,
  schedulingRow = null,
  showActions = false,
  columns = 'full',
  disableLazyRows = false,
  enableTitlePlayer = false,
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [logJob, setLogJob] = useState(null);
  const [playerJob, setPlayerJob] = useState(null);
  const sentinelRef = useRef(null);
  const playerPrefsMap = useJobPlayerPrefsMap().map;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filtered, jobs]);

  const visible = useMemo(() => {
    if (disableLazyRows) {
      return filtered;
    }
    return filtered.slice(0, visibleCount);
  }, [filtered, visibleCount, disableLazyRows]);

  const hasMore = !disableLazyRows && visibleCount < filtered.length;

  useEffect(() => {
    if (disableLazyRows) {
      return undefined;
    }
    const node = sentinelRef.current;
    if (!node || !hasMore) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((n) => Math.min(n + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, filtered.length, disableLazyRows]);

  if (initialLoading) {
    return (
      <LoadingOverlay
        loading
        label="Loading jobs…"
        className="jobs-table-initial-load"
      >
        <JobsTableSkeleton showActions={showActions} columns={columns} />
      </LoadingOverlay>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="empty-state">
        <p>No jobs match your filter.</p>
      </div>
    );
  }

  return (
    <LoadingOverlay loading={overlayLoading} label="Updating jobs…">
      <>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Row</th>
            <th>Status</th>
            <th>YouTube</th>
            <th>Log</th>
            {showActions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {visible.map((job) => (
            <tr key={job.row}>
              <td data-label="Title">
                {enableTitlePlayer && job.mp3_url ? (
                  <button
                    type="button"
                    className="job-title-btn truncate"
                    onClick={() => setPlayerJob(job)}
                    title="Play audio"
                  >
                    {playerPrefsMap[String(job.row)]?.favorite && (
                      <Star size={12} className="job-title-favorite" aria-hidden />
                    )}
                    {job.title || '(no title)'}
                  </button>
                ) : (
                  <div className="truncate job-title-text">
                    {playerPrefsMap[String(job.row)]?.favorite && (
                      <Star size={12} className="job-title-favorite" aria-hidden />
                    )}
                    {job.title || '(no title)'}
                  </div>
                )}
              </td>
              <td data-label="Row">
                <span className="job-card-value text-mono">#{job.row}</span>
              </td>
              <td data-label="Status">
                <div className="job-card-value job-card-value--stack">
                  {showActions && onStatusChange ? (
                    <JobStatusSelect
                      status={job.status}
                      saving={updatingStatusRow === job.row}
                      onChange={(newStatus) => onStatusChange(job, newStatus)}
                    />
                  ) : (
                    <StatusBadge status={job.status} />
                  )}
                  {job.schedule_time && !isPendingStatus(job.status) && (
                    <div className="job-card-meta text-muted">
                      {new Date(job.schedule_time).toLocaleString()}
                    </div>
                  )}
                </div>
              </td>
              <td data-label="YouTube">
                <span className="job-card-value">
                  {job.youtube_id ? (
                    <a
                      href={`https://youtu.be/${job.youtube_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="job-youtube-link"
                    >
                      ▶ {job.youtube_id}
                    </a>
                  ) : (
                    '—'
                  )}
                </span>
              </td>
              <td data-label="Log">
                <div className="job-card-value job-card-value--inline">
                  {(job.logs || '').trim() && !isPendingStatus(job.status) ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm job-log-btn"
                      onClick={() => setLogJob(job)}
                      title="View log"
                      aria-label="View log"
                    >
                      <NotebookText size={14} />
                      <span className="job-log-btn-label">View Log</span>
                    </button>
                  ) : (
                    <span className="job-log-empty">—</span>
                  )}
                </div>
              </td>
              {showActions && (
                <td data-label="Actions">
                  <div className="job-card-value job-card-value--actions job-actions">
                    {job.youtube_id && (
                      <a
                        href={`https://studio.youtube.com/video/${job.youtube_id}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost btn-sm job-action-btn"
                        title="YouTube Studio"
                        aria-label="Open in YouTube Studio"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {!isDoneStatus(job.status) && job.status !== 'processing' && onSchedule && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm job-action-btn"
                        onClick={() => onSchedule(job)}
                        disabled={schedulingRow === job.row}
                        title="Schedule — set status and date & time"
                        aria-label="Schedule"
                      >
                        <CalendarClock size={14} />
                      </button>
                    )}
                    {job.status === 'failed' && onRetry && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm job-action-btn"
                        onClick={() => onRetry(job)}
                        disabled={retryingRow === job.row}
                        title="Retry render for this row"
                        aria-label="Retry"
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <div ref={sentinelRef} className="lazy-load-sentinel">
          <span>Loading more rows…</span>
        </div>
      )}
      {!disableLazyRows && filtered.length > PAGE_SIZE && (
        <div className="lazy-load-meta">
          Showing {visible.length} of {filtered.length}
          {hasMore && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setVisibleCount((n) => Math.min(n + PAGE_SIZE, filtered.length))
              }
            >
              Load more
            </button>
          )}
        </div>
      )}
      <JobLogModal job={logJob} open={Boolean(logJob)} onClose={() => setLogJob(null)} />
      <Mp3PlayerModal
        job={playerJob}
        open={Boolean(playerJob)}
        onClose={() => setPlayerJob(null)}
      />
      </>
    </LoadingOverlay>
  );
}
