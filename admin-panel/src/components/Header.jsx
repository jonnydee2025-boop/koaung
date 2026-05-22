import { Bell, RefreshCw, Play, Square } from 'lucide-react';

export default function Header({
  title,
  subtitle,
  showRenderControl = false,
  renderRunning = false,
  renderStarting = false,
  onRenderNext,
  onStopRender,
}) {
  const handleRenderClick = () => {
    if (renderRunning) {
      onStopRender?.();
    } else {
      onRenderNext?.();
    }
  };

  const renderLabel = renderRunning
    ? 'Stop Rendering'
    : renderStarting
      ? 'Starting…'
      : 'Render Next';

  return (
    <header className="header">
      <div>
        <div className="header-title">{title}</div>
        {subtitle && <div className="header-subtitle">{subtitle}</div>}
      </div>
      <div className="header-actions">
        <button type="button" className="btn-icon" title="Notifications">
          <Bell size={16} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
        {showRenderControl && (
          <button
            id="btn-render-next"
            type="button"
            className={`btn btn-sm ${renderRunning ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleRenderClick}
            disabled={renderStarting}
          >
            {renderRunning ? <Square size={14} /> : <Play size={14} />}
            {renderLabel}
          </button>
        )}
      </div>
    </header>
  );
}
