import { RefreshCw } from 'lucide-react';

export default function SettingsTabStatus({ loading, refreshing, label }) {
  if (!loading && !refreshing) {
    return null;
  }

  return (
    <div
      className={`settings-tab-status${loading ? ' settings-tab-status--loading' : ' settings-tab-status--refreshing'}`}
      role="status"
      aria-live="polite"
    >
      <RefreshCw size={13} className="settings-tab-status-icon" aria-hidden="true" />
      <span>{loading ? `Loading ${label}…` : `Updating ${label}…`}</span>
    </div>
  );
}
