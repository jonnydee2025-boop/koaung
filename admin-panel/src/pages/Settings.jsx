import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import ErrorBanner from '../components/ErrorBanner';
import RowRulesTable from '../components/RowRulesTable';
import GeminiModelSettings from '../components/GeminiModelSettings';
import SettingsTabStatus from '../components/SettingsTabStatus';
import { shutdownServer } from '../data/api';
import { clearAdminApiKey } from '../data/adminAuth';
import {
  settingsSectionForPath,
  settingsSectionMeta,
} from '../data/settingsSections';
import { useLazyVisible } from '../hooks/useLazyVisible';
import { useSheetCacheInvalidation } from '../hooks/useSheetCacheInvalidation';
import { useSheetRefresh } from '../hooks/useSheetRefresh';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import {
  useCachedGeneralSettings,
  useCachedGeminiSettings,
  useCachedRowRulesSettings,
} from '../hooks/useSettingsData';
import {
  AlertTriangle,
  Bot,
  Info,
  LogOut,
} from 'lucide-react';

const ENV_FIELDS = [
  ['cfg-sheet-name', 'Sheet name', 'sheetName'],
  ['cfg-drive-folder', 'Background video folder', 'backgroundVideoFolder'],
  ['cfg-api-port', 'Admin API port', 'apiPort'],
  ['cfg-tmp-root', 'Temp directory', 'tmpRoot'],
  ['cfg-ffmpeg', 'FFmpeg binary', 'ffmpegBin'],
  ['cfg-ffprobe', 'FFprobe binary', 'ffprobeBin'],
];

function ConfigField({ id, label, fieldKey, cfg }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`form-input form-input--readonly${cfg ? '' : ' form-input--loading'}`}
        value={cfg ? (cfg[fieldKey] ?? '') : 'Loading…'}
        readOnly
      />
    </div>
  );
}

function GeneralSection({ cfg, meta, loading, refreshing }) {
  const confirm = useConfirm();

  const handleSignOut = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need your admin API key to sign in again on this device.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay signed in',
    });
    if (!ok) {
      return;
    }
    clearAdminApiKey();
    window.dispatchEvent(new Event('admin-auth-expired'));
  };

  return (
    <div className="settings-studio-panel">
      <SettingsTabStatus loading={loading} refreshing={refreshing} label="general settings" />
      <div className="settings-section-header settings-studio-panel-head">
        <div className="settings-section-header-main">
          <h2 className="settings-studio-panel-title">General</h2>
          <p className="settings-studio-panel-subtitle">
            Read-only mirror of <code>.env</code> — restart <code>videobot</code> after edits on
            the server.
          </p>
        </div>
      </div>

      <div className="settings-info-banner settings-studio-callout">
        <Info size={14} />
        <span>
          Row rules and Gemini models save from their sections and apply immediately. Use{' '}
          <strong>Render Next</strong> (Logs header) to process <code>do</code> rows only.
        </span>
      </div>

      <div className="settings-stat-grid">
        <div className="settings-stat-pill">
          <span className="settings-stat-pill-label">API health</span>
          <span className="settings-stat-pill-value settings-status-value--green">
            {cfg ? 'Connected' : '…'}
          </span>
        </div>
        <div className="settings-stat-pill">
          <span className="settings-stat-pill-label">Gemini API key</span>
          <span
            className={`settings-stat-pill-value ${
              meta?.geminiConfigured ? 'settings-status-value--green' : 'settings-status-value--yellow'
            }`}
          >
            {cfg
              ? meta?.geminiConfigured
                ? (meta?.geminiKeyCount ?? 0) > 1
                  ? `${meta.geminiKeyCount} keys`
                  : 'Configured'
                : 'Not set'
              : '…'}
          </span>
        </div>
      </div>

      <h3 className="settings-studio-subheading">Server configuration</h3>
      <div className="settings-config-grid settings-studio-env-grid">
        {ENV_FIELDS.map(([id, label, key]) => (
          <ConfigField key={id} id={id} label={label} fieldKey={key} cfg={cfg} />
        ))}
      </div>

      <div className="settings-studio-divider" />

      <h3 className="settings-studio-subheading">Feature flags</h3>
      <div className="settings-feature-row">
        <div>
          <div className="settings-feature-label">Audio enhancement</div>
          <div className="settings-feature-desc">
            Read-only · <code>ENABLE_AUDIO_ENHANCE</code>
          </div>
        </div>
        <span
          className={`settings-status-badge${
            cfg?.enableAudioEnhance ? ' settings-status-badge--on' : ''
          }`}
        >
          {cfg?.enableAudioEnhance ? 'On' : 'Off'}
        </span>
      </div>

      <div className="settings-studio-divider" />

      <h3 className="settings-studio-subheading">Session</h3>
      <div className="settings-status-rows settings-studio-status-block">
        {[
          ['API server', cfg ? `http://localhost:${cfg.apiPort}` : '…', 'settings-status-value--green'],
          ['Swagger', cfg ? `/docs on :${cfg.apiPort}` : '…', 'settings-status-value--accent'],
        ].map(([label, val, colorClass]) => (
          <div key={label} className="settings-status-row">
            <span className="settings-status-label">{label}</span>
            <span className={`settings-status-value ${colorClass}`}>{val}</span>
          </div>
        ))}
      </div>
      <p className="settings-status-hint">Admin API key is stored in this browser session only.</p>
      <button
        type="button"
        className="btn btn-ghost btn-sm settings-signout-btn settings-studio-signout"
        onClick={handleSignOut}
      >
        <LogOut size={14} />
        Sign out
      </button>
    </div>
  );
}

function DangerSection({ onKill }) {
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();

  const handleKillServer = async () => {
    const ok = await confirm({
      title: 'Shut down bot?',
      message:
        'This stops the Python backend. The web UI will disconnect until you restart videobot on the VPS.',
      confirmLabel: 'Shut down',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) {
      return;
    }
    try {
      await onKill();
      showSuccess('Shutdown signal sent.');
    } catch (e) {
      showError(`Failed to send shutdown signal: ${e.message}`);
    }
  };

  return (
    <div className="settings-studio-panel settings-studio-panel--danger">
      <div className="settings-section-header settings-studio-panel-head">
        <div className="settings-section-header-main">
          <h2 className="settings-studio-panel-title settings-danger-title">Danger zone</h2>
          <p className="settings-studio-panel-subtitle">
            Stops the Python backend. Restart manually with{' '}
            <code>systemctl start videobot</code>.
          </p>
        </div>
      </div>

      <div className="settings-danger-box">
        <div className="settings-danger-box-title">
          <Bot size={16} />
          Kill server
        </div>
        <p className="settings-danger-text">
          Sends a shutdown signal to the bot process. The admin panel will disconnect until the
          service is started again on the VPS.
        </p>
        <button type="button" className="settings-kill-btn" onClick={handleKillServer}>
          <AlertTriangle size={12} />
          Kill server
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const location = useLocation();
  const section = settingsSectionForPath(location.pathname);
  const { ref: pageRef, isVisible } = useLazyVisible({ initialVisible: true });
  const sheetRefresh = useSheetRefresh();
  const [refreshing, setRefreshing] = useState(false);

  const generalQuery = useCachedGeneralSettings({
    enabled: isVisible && section === 'general',
  });
  const geminiQuery = useCachedGeminiSettings({
    enabled: isVisible && section === 'ai',
  });
  const rowRulesQuery = useCachedRowRulesSettings({
    enabled: isVisible && section === 'rules',
  });

  const loadError =
    (section === 'general' && generalQuery.error) ||
    (section === 'ai' && geminiQuery.error) ||
    (section === 'rules' && rowRulesQuery.error) ||
    '';
  const loadErrorMessage =
    typeof loadError === 'string' ? loadError : loadError?.message || '';

  useSheetCacheInvalidation(
    generalQuery.refresh,
    geminiQuery.refresh,
    rowRulesQuery.refresh,
  );

  useEffect(() => {
    pageRef.current?.scrollTo?.({ top: 0 });
  }, [section, pageRef]);

  if (!section) {
    return <Navigate to="/general" replace />;
  }

  const meta = settingsSectionMeta(section);

  const handleHeaderRefresh = () => {
    setRefreshing(true);
    sheetRefresh();
    window.setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <>
      <Header
        title={meta.title}
        subtitle={meta.subtitle}
        onRefresh={handleHeaderRefresh}
        refreshing={refreshing}
      />
      <div ref={pageRef} className="page-content settings-page settings-studio-page">
        {loadErrorMessage && <ErrorBanner message={loadErrorMessage} />}

        <main className="settings-studio-main settings-studio-main--solo">
          {section === 'general' && (
            <GeneralSection
              cfg={generalQuery.cfg}
              meta={generalQuery.meta}
              loading={generalQuery.isInitialLoad}
              refreshing={generalQuery.refreshing}
            />
          )}
          {section === 'ai' && (
            <GeminiModelSettings embedded query={geminiQuery} />
          )}
          {section === 'rules' && (
            <RowRulesTable embedded query={rowRulesQuery} />
          )}
          {section === 'danger' && (
            <DangerSection onKill={shutdownServer} />
          )}
        </main>
      </div>
    </>
  );
}
