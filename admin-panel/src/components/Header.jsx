import { RefreshCw, Play, Square, Menu } from 'lucide-react';
import { useMobileNav } from '../context/MobileNavContext';

export default function Header({
  title,
  subtitle,
  showRenderControl = false,
  renderRunning = false,
  renderStarting = false,
  onRenderNext,
  onStopRender,
  onRefresh,
  refreshing = false,
}) {
  const { toggleSidebar } = useMobileNav();

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
      : 'Render Next (do)';

  return (
    <header className="header">
      <div className="header-leading">
        <button
          type="button"
          className="btn-icon mobile-only header-menu-btn"
          aria-label="Open navigation menu"
          onClick={toggleSidebar}
        >
          <Menu size={18} />
        </button>
        <div className="header-titles">
          <div className="header-title">{title}</div>
          {subtitle && <div className="header-subtitle">{subtitle}</div>}
        </div>
      </div>
      <div className="header-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm header-refresh-btn"
          onClick={onRefresh}
          disabled={!onRefresh || refreshing}
          title="Refresh data"
          aria-label="Refresh data"
        >
          <RefreshCw size={14} className={refreshing ? 'icon-spin' : undefined} />
          <span className="header-btn-label">Refresh</span>
        </button>
        {showRenderControl && (
          <button
            id="btn-render-next"
            type="button"
            className={`btn btn-sm ${renderRunning ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleRenderClick}
            disabled={renderStarting}
            title="Process the next row with status do only"
          >
            {renderRunning ? <Square size={14} /> : <Play size={14} />}
            <span className="header-btn-label">{renderLabel}</span>
          </button>
        )}
      </div>
    </header>
  );
}
