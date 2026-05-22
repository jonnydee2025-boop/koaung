import { useState } from 'react';
import Header from '../components/Header';
import LazyJobTable from '../components/LazyJobTable';
import { Video, CheckCircle, Clock, XCircle, TrendingUp, ArrowUpRight, PlayCircle, RefreshCw } from 'lucide-react';
import { cancelRender } from '../data/api';
import { invalidateSheetCaches } from '../data/queryCache';
import {
  useCachedStats,
  useCachedJobs,
  useCachedRenderStatus,
} from '../hooks/useSheetData';

function Skeleton({ h = 20, w = '100%', r = 6 }) {
  return (
    <div
      style={{
        height: h,
        width: w,
        borderRadius: r,
        background: 'var(--bg-hover)',
        animation: 'shimmer 1.5s infinite',
      }}
    />
  );
}

function CacheHint({ refreshing, updatedAt }) {
  if (!updatedAt) return null;
  return (
    <span className="cache-hint" title="Data may be served from cache while refreshing">
      {refreshing ? 'Updating…' : `Cached · ${updatedAt.toLocaleTimeString()}`}
    </span>
  );
}

export default function Dashboard() {
  const statsQuery = useCachedStats({ pollMs: 8000 });
  const jobsQuery = useCachedJobs(6, { pollMs: 8000 });
  const renderQuery = useCachedRenderStatus();

  const stats = statsQuery.data;
  const jobs = jobsQuery.data ?? [];
  const renderStatus = renderQuery.data ?? {
    running: false,
    pct: 0,
    status: 'Idle',
    title: '',
  };

  const [actionError, setActionError] = useState('');

  const errors = [statsQuery.error, jobsQuery.error, renderQuery.error].filter(Boolean);
  const error = actionError || errors.join(' | ');
  const refreshing = statsQuery.refreshing || jobsQuery.refreshing || renderQuery.refreshing;
  const lastRefresh = statsQuery.updatedAt || jobsQuery.updatedAt;

  const refreshAll = () => {
    invalidateSheetCaches();
    statsQuery.refresh();
    jobsQuery.refresh();
    renderQuery.refresh();
  };

  const handleCancelRender = async () => {
    if (
      !window.confirm(
        'Are you sure you want to kill the FFmpeg render process? This will mark the job as cancelled.',
      )
    ) {
      return;
    }
    try {
      await cancelRender();
      refreshAll();
    } catch (e) {
      setActionError(`Failed to cancel render: ${e.message}`);
    }
  };

  const statusBreakdown = stats
    ? [
        {
          label: 'Completed',
          value: stats.done,
          color: '#22c55e',
          pct: stats.total ? +(stats.done / stats.total * 100).toFixed(1) : 0,
        },
        {
          label: 'Pending',
          value: stats.pending,
          color: '#f59e0b',
          pct: stats.total ? +(stats.pending / stats.total * 100).toFixed(1) : 0,
        },
        {
          label: 'Processing',
          value: stats.processing,
          color: '#6c63ff',
          pct: stats.total ? +(stats.processing / stats.total * 100).toFixed(1) : 0,
        },
        {
          label: 'Failed',
          value: stats.failed,
          color: '#ef4444',
          pct: stats.total ? +(stats.failed / stats.total * 100).toFixed(1) : 0,
        },
      ]
    : [];

  const statsLoading = statsQuery.loading && stats == null;

  return (
    <>
      <Header
        title="Dashboard"
        subtitle={
          lastRefresh
            ? `Last updated ${lastRefresh.toLocaleTimeString()}`
            : 'Video Automation Bot — overview'
        }
      />
      <div className="page-content">
        {(refreshing || lastRefresh) && (
          <div className="cache-bar">
            <CacheHint refreshing={refreshing} updatedAt={lastRefresh} />
          </div>
        )}

        {error && (
          <div
            style={{
              background: 'var(--red-dim)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: '10px 16px',
              marginBottom: 20,
              fontSize: 13,
              color: 'var(--red)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            ⚠ {error}
          </div>
        )}

        {renderStatus.running && (
          <div className="render-banner">
            <div className="render-banner-header">
              <span className="render-banner-title">
                🎬 {renderStatus.title || 'Rendering video…'}
              </span>
              <span className="render-banner-step">{renderStatus.status || 'Working'}</span>
            </div>
            {(renderStatus.monk || renderStatus.duration) && (
              <div className="render-banner-meta">
                {renderStatus.monk && <span>{renderStatus.monk}</span>}
                {renderStatus.monk && renderStatus.duration && <span> · </span>}
                {renderStatus.duration && <span>{renderStatus.duration}</span>}
              </div>
            )}
            <div className="progress-bar">
              <div
                className="progress-fill accent"
                style={{ width: `${Math.max(renderStatus.pct || 0, 2)}%` }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 10,
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {Number(renderStatus.pct || 0).toFixed(1)}% complete
              </div>
              <button
                type="button"
                className="btn btn-sm"
                style={{
                  background: 'var(--red-dim)',
                  color: 'var(--red)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  padding: '4px 8px',
                  fontSize: 11,
                }}
                onClick={handleCancelRender}
              >
                <XCircle size={12} style={{ marginRight: 4 }} />
                Cancel Render
              </button>
            </div>
          </div>
        )}

        <div className="stats-grid section-gap">
          {[
            {
              color: 'accent',
              icon: <Video size={20} />,
              value: stats?.total ?? '—',
              label: 'Total Jobs',
              delta: 'All time',
            },
            {
              color: 'green',
              icon: <CheckCircle size={20} />,
              value: stats ? `${stats.success_rate}%` : '—',
              label: 'Success Rate',
              delta: `${stats?.done ?? 0} done`,
            },
            {
              color: 'yellow',
              icon: <Clock size={20} />,
              value: stats?.pending ?? '—',
              label: 'Pending Jobs',
              delta: 'In queue',
            },
            {
              color: 'red',
              icon: <XCircle size={20} />,
              value: stats?.failed ?? '—',
              label: 'Failed Jobs',
              delta: 'Needs review',
            },
          ].map(({ color, icon, value, label, delta }) => (
            <div key={label} className={`stat-card ${color}`}>
              <div className={`stat-icon ${color}`}>{icon}</div>
              <div className="stat-value">
                {statsLoading ? <Skeleton h={32} w={60} /> : value}
              </div>
              <div className="stat-label">{label}</div>
              <span className={`stat-delta ${color === 'red' ? 'down' : 'up'}`}>
                <ArrowUpRight size={11} />
                {delta}
              </span>
            </div>
          ))}
        </div>

        <div className="chart-row">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Status Breakdown</div>
                <div className="card-subtitle">Live from Google Sheet</div>
              </div>
              <TrendingUp size={16} style={{ color: 'var(--text-muted)' }} />
            </div>
            {statsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} h={40} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {statusBreakdown.map((s) => (
                  <div key={s.label}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 5,
                      }}
                    >
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {s.label}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: s.color }}>
                        {s.value}{' '}
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          ({s.pct}%)
                        </span>
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${s.pct}%`, background: s.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>Processing now</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {stats?.processing ?? '—'} job(s)
              </span>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Quick Stats</div>
              </div>
              <PlayCircle size={16} style={{ color: '#ef4444' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
              {[
                ['Total Sheet Rows', stats?.total ?? '—', 'var(--text-primary)'],
                ['Successfully Uploaded', stats?.done ?? '—', '#22c55e'],
                ['Awaiting Render', stats?.pending ?? '—', '#f59e0b'],
                ['Currently Processing', stats?.processing ?? '—', '#6c63ff'],
                ['Failed / Error', stats?.failed ?? '—', '#ef4444'],
              ].map(([label, val, color]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: 10,
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontWeight: 700, color }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Recent Jobs</div>
              <div className="card-subtitle">Live from Google Sheet</div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshAll}>
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
          <div className="table-wrap">
            {jobs.length === 0 && !jobsQuery.loading ? (
              <div className="empty-state">
                <p>No jobs found in the sheet.</p>
              </div>
            ) : (
              <LazyJobTable
                jobs={jobs}
                loading={jobsQuery.loading}
                filtered={jobs}
                showActions={false}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
