import { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import { triggerRenderNext, cancelRender } from '../data/api';
import { invalidateSheetCaches } from '../data/queryCache';
import { useLazyVisible } from '../hooks/useLazyVisible';
import { useCachedLogs, useCachedRenderStatus } from '../hooks/useSheetData';
import { Download, RefreshCw } from 'lucide-react';

const LEVELS = ['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR'];

export default function Logs() {
  const { ref: pageRef, isVisible } = useLazyVisible();
  const logsQuery = useCachedLogs({ enabled: isVisible });
  const renderQuery = useCachedRenderStatus({ enabled: isVisible });

  const [levelFilter, setLevel] = useState('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const [renderStarting, setRenderStarting] = useState(false);
  const [renderError, setRenderError] = useState('');
  const bottomRef = useRef(null);

  const logs = logsQuery.data ?? [];
  const renderRunning = Boolean(renderQuery.data?.running);
  const loading = !isVisible || logsQuery.isInitialLoad;
  const error = logsQuery.error;

  useEffect(() => {
    const handleInvalidate = () => {
      logsQuery.refresh();
      renderQuery.refresh();
    };
    window.addEventListener('sheet-cache-invalidated', handleInvalidate);
    return () => window.removeEventListener('sheet-cache-invalidated', handleInvalidate);
  }, [logsQuery.refresh, renderQuery.refresh]);

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

  const handleRenderNext = async () => {
    setRenderError('');
    setRenderStarting(true);
    try {
      await triggerRenderNext();
      refreshAll();
    } catch (e) {
      setRenderError(e.message);
    } finally {
      setRenderStarting(false);
    }
  };

  const handleStopRender = async () => {
    setRenderError('');
    try {
      await cancelRender();
      refreshAll();
    } catch (e) {
      setRenderError(e.message);
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
      />
      <div ref={pageRef} className="page-content">
        {displayError && (
          <div
            style={{
              background: 'var(--red-dim)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: '10px 16px',
              marginBottom: 16,
              fontSize: 13,
              color: 'var(--red)',
            }}
          >
            ⚠ {displayError}
          </div>
        )}
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
              <div className="log-container-placeholder">Loading logs…</div>
            ) : filtered.length === 0 ? (
              <div
                style={{
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  textAlign: 'center',
                  padding: 40,
                }}
              >
                {error
                  ? 'Could not load logs.'
                  : 'No log entries yet. Start the bot to see activity here.'}
              </div>
            ) : (
              filtered.map((line, i) => (
                <div key={i} className="log-line">
                  <span className="log-time">{line.time}</span>
                  <span className={`log-level ${line.level}`}>{line.level}</span>
                  <span className="log-msg">{line.msg}</span>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    </>
  );
}
