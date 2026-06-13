import { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import PageLoader from '../components/PageLoader';
import ErrorBanner from '../components/ErrorBanner';
import { triggerRenderNext, cancelRender } from '../data/api';
import { invalidateSheetCaches } from '../data/queryCache';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { useLazyVisible } from '../hooks/useLazyVisible';
import { useSheetCacheInvalidation } from '../hooks/useSheetCacheInvalidation';
import { useSheetRefresh } from '../hooks/useSheetRefresh';
import { useCachedLogs, useCachedRenderStatus } from '../hooks/useSheetData';
import { Download, RefreshCw } from 'lucide-react';

const LEVELS = ['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR'];

/** Highlight retry-hold log lines. */
function logLineAccent(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('kept on vps for retry') || m.includes('files kept on vps for retry')) {
    return 'retry';
  }
  return null;
}

export default function Logs() {
  const { ref: pageRef, isVisible } = useLazyVisible();
  const logsQuery = useCachedLogs({ enabled: isVisible });
  const renderQuery = useCachedRenderStatus({ enabled: isVisible });

  const [levelFilter, setLevel] = useState('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const [renderStarting, setRenderStarting] = useState(false);
  const [renderError, setRenderError] = useState('');
  const bottomRef = useRef(null);
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();
  const sheetRefresh = useSheetRefresh();
  const [refreshing, setRefreshing] = useState(false);

  const logs = logsQuery.data ?? [];
  const renderRunning = Boolean(renderQuery.data?.running);
  const loading = !isVisible || logsQuery.isInitialLoad;
  const error = logsQuery.error;

  useSheetCacheInvalidation(logsQuery.refresh, renderQuery.refresh);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const refreshAll = () => {
    invalidateSheetCaches();
    logsQuery.refresh();
    renderQuery.refresh();
  };

  const handleHeaderRefresh = () => {
    setRefreshing(true);
    sheetRefresh();
    window.setTimeout(() => setRefreshing(false), 600);
  };

  const handleRenderNext = async () => {
    setRenderError('');
    setRenderStarting(true);
    try {
      await triggerRenderNext();
      refreshAll();
      showSuccess('Render started for next do row.');
    } catch (e) {
      setRenderError(e.message);
      showError(e.message);
    } finally {
      setRenderStarting(false);
    }
  };

  const handleStopRender = async () => {
    const ok = await confirm({
      title: 'Stop render?',
      message:
        'This will cancel the current FFmpeg render and mark the job as cancelled.',
      confirmLabel: 'Stop render',
      cancelLabel: 'Keep running',
      variant: 'danger',
    });
    if (!ok) {
      return;
    }

    setRenderError('');
    try {
      await cancelRender();
      refreshAll();
      showSuccess('Render stopped.');
    } catch (e) {
      setRenderError(e.message);
      showError(e.message);
    }
  };

  const filtered = logs.filter((l) => levelFilter === 'ALL' || l.level === levelFilter);

  const handleExport = () => {
    const text = filtered.map((l) => `${l.time} [${l.level}] ${l.msg}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'videobot-logs.txt';
    a.click();
    URL.revokeObjectURL(url);
    showSuccess(`Exported ${filtered.length} log entries.`);
  };

  const displayError = error || renderError;

  return (
    <>
      <Header
        title="Logs"
        subtitle="Live bot activity — auto-refreshes every 5s"
        showRenderControl
        renderRunning={renderRunning}
        renderStarting={renderStarting}
        onRenderNext={handleRenderNext}
        onStopRender={handleStopRender}
        onRefresh={handleHeaderRefresh}
        refreshing={refreshing}
      />
      <div ref={pageRef} className="page-content">
        {displayError && <ErrorBanner message={displayError} />}
        <div className="card logs-card">
          <div className="logs-toolbar">
            <div className="logs-level-filters">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`btn btn-ghost btn-sm logs-level-tab${levelFilter === level ? ' is-active' : ''}`}
                  onClick={() => setLevel(level)}
                >
                  {level}
                </button>
              ))}
            </div>
            <div className="logs-toolbar-actions">
              <label className="logs-autoscroll">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                />
                Auto-scroll
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={refreshAll}>
                <RefreshCw size={13} />
                Refresh
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleExport}>
                <Download size={13} />
                Export
              </button>
            </div>
          </div>

          <div className="logs-card-meta">
            <div className="card-title">Activity Log</div>
            <div className="card-subtitle">{filtered.length} entries</div>
          </div>

          <div className={`log-container${loading ? ' log-container--loading' : ''}`} id="log-viewer">
            {loading ? (
              <PageLoader variant="inline" label="Loading logs…" />
            ) : filtered.length === 0 ? (
              <div className="logs-empty-state">
                {error ? 'Could not load logs.' : 'No log entries match the current filter.'}
              </div>
            ) : (
              filtered.map((line, i) => {
                const accent = logLineAccent(line.msg);
                return (
                  <div key={i} className={`log-line${accent ? ` log-line--${accent}` : ''}`}>
                    <span className="log-time">{line.time}</span>
                    <span className={`log-level ${line.level}`}>{line.level}</span>
                    <span className="log-msg">{line.msg}</span>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    </>
  );
}
