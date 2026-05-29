import { useState, useEffect, useRef, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import JobLogModal from './JobLogModal';
import Mp3PlayerModal from './Mp3PlayerModal';
import JobStatusSelect from './JobStatusSelect';
import Skeleton from './Skeleton';
import { RotateCcw, ExternalLink, CalendarClock, NotebookText } from 'lucide-react';
import { isDoneStatus, isPendingStatus } from '../data/statusTheme';

const PAGE_SIZE = 25;

export default function LazyJobTable({
  jobs,
  loading,
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

  if (loading && jobs.length === 0) {
    return (
      <table>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i}>
              <td colSpan={columns === 'full' ? 6 : 5}>
                <Skeleton />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
              <td>
                {enableTitlePlayer && job.mp3_url ? (
                  <button
                    type="button"
                    className="job-title-btn truncate"
                    onClick={() => setPlayerJob(job)}
                    title="Play audio"
                  >
                    {job.title || '(no title)'}
                  </button>
                ) : (
                  <div className="truncate">{job.title || '(no title)'}</div>
                )}
              </td>
              <td className="text-mono">#{job.row}</td>
              <td>
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
                  <div className="text-muted" style={{ fontSize: 10, marginTop: 4 }}>
                    {new Date(job.schedule_time).toLocaleString()}
                  </div>
                )}
              </td>
              <td>
                {job.youtube_id ? (
                  <a
                    href={`https://youtu.be/${job.youtube_id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11, color: 'var(--accent)' }}
                  >
                    ▶ {job.youtube_id}
                  </a>
                ) : (
                  '—'
                )}
              </td>
              <td>
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
                  '—'
                )}
              </td>
              {showActions && (
                <td>
                  <div className="job-actions">
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
  );
}
