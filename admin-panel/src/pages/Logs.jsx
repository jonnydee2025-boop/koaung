import { useState, useEffect, useRef, useCallback } from 'react';
import Header from '../components/Header';
import {
  fetchLogs,
  fetchRenderStatus,
  triggerRenderNext,
  cancelRender,
} from '../data/api';
import { Download, RefreshCw } from 'lucide-react';

const LEVELS = ['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR'];

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [levelFilter, setLevel] = useState('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const [error, setError] = useState('');
  const [renderRunning, setRenderRunning] = useState(false);
  const [renderStarting, setRenderStarting] = useState(false);
  const [renderError, setRenderError] = useState('');
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setLogs(await fetchLogs(150));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const pollRenderStatus = useCallback(async () => {
    try {
      const status = await fetchRenderStatus();
      setRenderRunning(Boolean(status.running));
    } catch {
      // API unreachable — keep last known state
    }
  }, []);

  useEffect(() => {
    load();
    pollRenderStatus();
    const logsInterval = setInterval(load, 5000);
    const renderInterval = setInterval(pollRenderStatus, 2000);
    return () => {
      clearInterval(logsInterval);
      clearInterval(renderInterval);
    };
  }, [load, pollRenderStatus]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleRenderNext = async () => {
    setRenderError('');
    setRenderStarting(true);
    try {
      await triggerRenderNext();
      await pollRenderStatus();
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
      setRenderRunning(false);
    } catch (e) {
      setRenderError(e.message);
    } finally {
      await pollRenderStatus();
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
      <div className="page-content">
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
              <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
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

          <div className="log-container" id="log-viewer">
            {filtered.length === 0 ? (
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
