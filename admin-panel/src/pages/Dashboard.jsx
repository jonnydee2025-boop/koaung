import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import ContentCalendar from '../components/ContentCalendar';
import PageLoader from '../components/PageLoader';
import Spinner from '../components/Spinner';
import ErrorBanner from '../components/ErrorBanner';
import { Video, CheckCircle, Clock, XCircle, TrendingUp, ArrowUpRight, PlayCircle } from 'lucide-react';
import { cancelRender } from '../data/api';
import { buildJobsLink } from '../data/jobsDeepLink';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { useLazyVisible } from '../hooks/useLazyVisible';
import { useSheetRefresh } from '../hooks/useSheetRefresh';
import {
  useCachedStats,
  useCachedRenderStatus,
} from '../hooks/useSheetData';

export default function Dashboard() {
  const { ref: pageRef, isVisible } = useLazyVisible({ initialVisible: true });
  const statsQuery = useCachedStats({ pollMs: 8000, enabled: isVisible });
  const renderQuery = useCachedRenderStatus({ enabled: isVisible });
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();
  const sheetRefresh = useSheetRefresh();
  const [refreshing, setRefreshing] = useState(false);

  const stats = statsQuery.data;
  const renderStatus = renderQuery.data ?? {
    running: false,
    pct: 0,
    status: 'Idle',
    title: '',
  };

  const errors = [statsQuery.error, renderQuery.error].filter(Boolean);
  const error = errors.join(' | ');

  const refreshAll = () => {
    sheetRefresh();
    statsQuery.refresh();
    renderQuery.refresh();
  };

  const handleHeaderRefresh = () => {
    setRefreshing(true);
    sheetRefresh();
    window.setTimeout(() => setRefreshing(false), 600);
  };

  const handleCancelRender = async () => {
    const ok = await confirm({
      title: 'Cancel render?',
      message:
        'This will kill the FFmpeg render process and mark the job as cancelled.',
      confirmLabel: 'Cancel render',
      cancelLabel: 'Keep running',
      variant: 'danger',
    });
    if (!ok) {
      return;
    }
    try {
      await cancelRender();
      refreshAll();
      showSuccess('Render cancelled.');
    } catch (e) {
      showError(`Failed to cancel render: ${e.message}`);
    }
  };

  const statusBreakdown = stats
    ? [
        {
          label: 'Completed',
          value: stats.done,
          colorClass: 'stat-color-green',
          pct: stats.total ? +(stats.done / stats.total * 100).toFixed(1) : 0,
          status: 'done',
        },
        {
          label: 'Pending',
          value: stats.pending,
          colorClass: 'stat-color-yellow',
          pct: stats.total ? +(stats.pending / stats.total * 100).toFixed(1) : 0,
          status: 'pending',
        },
        {
          label: 'Processing',
          value: stats.processing,
          colorClass: 'stat-color-accent',
          pct: stats.total ? +(stats.processing / stats.total * 100).toFixed(1) : 0,
          status: 'processing',
        },
        {
          label: 'Failed',
          value: stats.failed,
          colorClass: 'stat-color-red',
          pct: stats.total ? +(stats.failed / stats.total * 100).toFixed(1) : 0,
          status: 'failed',
        },
      ]
    : [];

  const statsLoading = statsQuery.loading && stats == null;

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Dhamma Channel — overview"
        onRefresh={handleHeaderRefresh}
        refreshing={refreshing}
      />
      <div ref={pageRef} className="page-content">
        {error && <ErrorBanner message={error} />}

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
                style={{ '--progress-pct': `${Math.max(renderStatus.pct || 0, 2)}%` }}
              />
            </div>
            <div className="render-banner-footer">
              <div className="render-banner-pct">
                {Number(renderStatus.pct || 0).toFixed(1)}% complete
              </div>
              <button
                type="button"
                className="btn btn-sm render-banner-cancel-btn"
                onClick={handleCancelRender}
              >
                <XCircle size={12} aria-hidden />
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
              status: 'all',
            },
            {
              color: 'green',
              icon: <CheckCircle size={20} />,
              value: stats ? `${stats.success_rate}%` : '—',
              label: 'Success Rate',
              delta: `${stats?.done ?? 0} done`,
              status: 'done',
            },
            {
              color: 'yellow',
              icon: <Clock size={20} />,
              value: stats?.pending ?? '—',
              label: 'Pending Jobs',
              delta: 'In queue',
              status: 'pending',
            },
            {
              color: 'red',
              icon: <XCircle size={20} />,
              value: stats?.failed ?? '—',
              label: 'Failed Jobs',
              delta: 'Needs review',
              status: 'failed',
            },
          ].map(({ color, icon, value, label, delta, status }) => (
            <Link
              key={label}
              to={buildJobsLink({ status })}
              className={`stat-card stat-card-link ${color}`}
              aria-label={`${label} — view in Jobs`}
            >
              <div className={`stat-icon ${color}`}>{icon}</div>
              <div className="stat-value">
                {statsLoading ? (
                  <span className="stat-value-spinner">
                    <Spinner size="sm" />
                  </span>
                ) : (
                  value
                )}
              </div>
              <div className="stat-label">{label}</div>
              <span className={`stat-delta ${color === 'red' ? 'down' : 'up'}`}>
                <ArrowUpRight size={11} />
                {delta}
              </span>
            </Link>
          ))}
        </div>

        <div className="chart-row">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Status Breakdown</div>
                <div className="card-subtitle">Live from Google Sheet</div>
              </div>
              <TrendingUp size={16} className="card-header-icon" aria-hidden />
            </div>
            {statsLoading ? (
              <PageLoader variant="section" label="Loading breakdown…" />
            ) : (
              <>
            <div className="status-breakdown-list">
                {statusBreakdown.map((s) => (
                  <Link
                    key={s.label}
                    to={buildJobsLink({ status: s.status })}
                    className="dashboard-jobs-link status-breakdown-link"
                    aria-label={`${s.label} jobs — view in Jobs`}
                  >
                    <div className="status-breakdown-row-header">
                      <span className="status-breakdown-label">{s.label}</span>
                      <span className={`status-breakdown-value ${s.colorClass}`}>
                        {s.value}{' '}
                        <span className="status-breakdown-pct">({s.pct}%)</span>
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${s.colorClass}`}
                        style={{ '--progress-pct': `${s.pct}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            <div className="status-breakdown-footer">
              <span className="status-breakdown-footer-muted">Processing now</span>
              <Link
                to={buildJobsLink({ status: 'processing' })}
                className="dashboard-jobs-link stat-color-accent status-breakdown-footer-value"
                aria-label="Processing jobs — view in Jobs"
              >
                {stats?.processing ?? '—'} job(s)
              </Link>
            </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Quick Stats</div>
              </div>
              <PlayCircle size={16} className="stat-color-red" />
            </div>
            <div className="quick-stats-list">
              {[
                ['Total Sheet Rows', stats?.total ?? '—', '', 'all'],
                ['Successfully Uploaded', stats?.done ?? '—', 'stat-color-green', 'done'],
                ['Awaiting Render', stats?.pending ?? '—', 'stat-color-yellow', 'pending'],
                ['Currently Processing', stats?.processing ?? '—', 'stat-color-accent', 'processing'],
                ['Failed / Error', stats?.failed ?? '—', 'stat-color-red', 'failed'],
              ].map(([label, val, colorClass, status]) => (
                <Link
                  key={label}
                  to={buildJobsLink({ status })}
                  className="dashboard-jobs-link quick-stats-row"
                  aria-label={`${label} — view in Jobs`}
                >
                  <span className="quick-stats-label">{label}</span>
                  <span className={`quick-stats-value${colorClass ? ` ${colorClass}` : ''}`}>
                    {statsLoading ? (
                      <Spinner size="sm" />
                    ) : (
                      val
                    )}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <ContentCalendar />
      </div>
    </>
  );
}
