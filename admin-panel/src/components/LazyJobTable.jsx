import { useState, useEffect, useRef, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import { RotateCcw, ExternalLink } from 'lucide-react';

const PAGE_SIZE = 25;

function Skeleton({ h = 18 }) {
  return (
    <div
      style={{
        height: h,
        width: '100%',
        borderRadius: 6,
        background: 'var(--bg-hover)',
        animation: 'shimmer 1.5s infinite',
      }}
    />
  );
}

export default function LazyJobTable({
  jobs,
  loading,
  filtered,
  onRetry,
  showActions = false,
  columns = 'full',
  disableLazyRows = false,
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
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
              <td colSpan={columns === 'full' ? 7 : 6}>
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
            <th>Monk / Teacher</th>
            <th>YouTube</th>
            <th>Log</th>
            {showActions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {visible.map((job) => (
            <tr key={job.row}>
              <td>
                <div className="truncate">{job.title || '(no title)'}</div>
              </td>
              <td className="text-mono">#{job.row}</td>
              <td>
                <StatusBadge status={job.status} />
              </td>
              <td className="text-muted">{job.monk || '—'}</td>
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
                <div
                  className="truncate text-muted"
                  style={{ maxWidth: 200, fontSize: 11 }}
                >
                  {showActions
                    ? job.logs?.split('\n')[0] || '—'
                    : job.logs || '—'}
                </div>
              </td>
              {showActions && (
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {job.youtube_id && (
                      <a
                        href={`https://studio.youtube.com/video/${job.youtube_id}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost btn-sm"
                        title="YouTube Studio"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                    {job.status === 'failed' && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={onRetry}
                      >
                        <RotateCcw size={12} /> Retry
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
    </>
  );
}
