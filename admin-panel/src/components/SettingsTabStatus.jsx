import Spinner from './Spinner';

export default function SettingsTabStatus({ loading, refreshing, label }) {
  if (!loading && !refreshing) {
    return null;
  }

  return (
    <div
      className={`settings-tab-status${loading ? ' settings-tab-status--loading' : ' settings-tab-status--refreshing'}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size="sm" className="settings-tab-status-icon" />
      <span>{loading ? `Loading ${label}…` : `Updating ${label}…`}</span>
    </div>
  );
}
