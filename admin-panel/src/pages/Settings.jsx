import { useState, useEffect } from 'react';
import Header from '../components/Header';
import RowRulesTable from '../components/RowRulesTable';
import GeminiModelSettings from '../components/GeminiModelSettings';
import IntervalTriggerSettings from '../components/IntervalTriggerSettings';
import { fetchSettings, shutdownServer } from '../data/api';
import { clearAdminApiKey } from '../data/adminAuth';
import { Save, Info, AlertTriangle, LogOut } from 'lucide-react';

const GENERAL_COL_1 = [
  ['cfg-sheet-name', 'Sheet Name', 'sheetName'],
  ['cfg-drive-folder', 'Background Video Drive Folder', 'backgroundVideoFolder'],
  ['cfg-api-port', 'Admin API Port', 'apiPort'],
];

const GENERAL_COL_2 = [
  ['cfg-tmp-root', 'Temp Directory', 'tmpRoot'],
  ['cfg-ffmpeg', 'FFmpeg Binary', 'ffmpegBin'],
  ['cfg-ffprobe', 'FFprobe Binary', 'ffprobeBin'],
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

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSettings()
      .then((data) =>
        setCfg({
          sheetName: data.sheet_name,
          tmpRoot: data.tmp_root,
          ffmpegBin: data.ffmpeg_bin,
          ffprobeBin: data.ffprobe_bin,
          backgroundVideoFolder: data.background_video_folder,
          enableAudioEnhance: data.enable_audio_enhance,
          apiPort: data.api_port,
        }),
      )
      .catch((e) => setError(e.message));
  }, []);

  const update = (key, val) => setCfg((prev) => ({ ...prev, [key]: val }));

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleKillServer = async () => {
    if (
      !window.confirm(
        'Shut down the Python bot process? The web UI will disconnect until you restart the bot on the server.',
      )
    ) {
      return;
    }
    try {
      await shutdownServer();
      setError('Shutdown signal sent. Server is stopping…');
    } catch (e) {
      setError(`Failed to send shutdown signal: ${e.message}`);
    }
  };

  return (
    <>
      <Header title="Settings" subtitle="Live config from bot" />
      <div className="page-content settings-page">
        {error && (
          <div className="settings-alert settings-alert--error">
            ⚠ {error}
          </div>
        )}

        <div className="settings-info-banner">
          <Info size={14} />
          <span>
            General options are read from <code>.env</code> (restart the bot after
            edits). Row-Based Rules, interval triggers, and Gemini model fallback are saved
            on the server and apply immediately.
          </span>
        </div>

        <div className="settings-top-grid">
          <div className="card settings-card">
            <div className="settings-section-header">
              <div className="settings-section-header-main">
                <div className="settings-section-title">General Configuration</div>
              </div>
            </div>
            <div className="settings-config-grid">
              <div className="settings-config-col">
                {GENERAL_COL_1.map(([id, label, key]) => (
                  <ConfigField
                    key={id}
                    id={id}
                    label={label}
                    fieldKey={key}
                    cfg={cfg}
                  />
                ))}
              </div>
              <div className="settings-config-col">
                {GENERAL_COL_2.map(([id, label, key]) => (
                  <ConfigField
                    key={id}
                    id={id}
                    label={label}
                    fieldKey={key}
                    cfg={cfg}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm settings-ack-btn"
              onClick={handleSave}
              disabled={!cfg}
            >
              <Save size={14} />
              {saved ? '✓ Noted (edit .env to persist)' : 'Acknowledge'}
            </button>
          </div>

          <div className="settings-side-stack">
            <div className="card settings-card">
              <div className="settings-section-header">
                <div className="settings-section-header-main">
                  <div className="settings-section-title">Feature Flags</div>
                </div>
              </div>
              <div className="toggle-row">
                <div className="toggle-info">
                  <div className="toggle-label">Audio Enhancement</div>
                  <div className="toggle-desc">
                    FFmpeg voice EQ + loudness (ENABLE_AUDIO_ENHANCE)
                  </div>
                </div>
                <label className="toggle">
                  <input
                    id="toggle-enableAudioEnhance"
                    type="checkbox"
                    checked={cfg ? Boolean(cfg.enableAudioEnhance) : false}
                    onChange={(e) => update('enableAudioEnhance', e.target.checked)}
                    disabled={!cfg}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="card settings-card settings-status-card">
              <div className="settings-section-header">
                <div className="settings-section-header-main">
                  <div className="settings-section-title">System Status</div>
                </div>
              </div>
              <div className="settings-status-rows">
                {[
                  ['API Server', cfg ? `http://localhost:${cfg.apiPort}` : '…', 'settings-status-value--green'],
                  ['Swagger', cfg ? `/docs on :${cfg.apiPort}` : '…', 'settings-status-value--accent'],
                  ['Health', cfg ? 'Connected' : 'Connecting…', 'settings-status-value--green'],
                ].map(([label, val, colorClass]) => (
                  <div key={label} className="settings-status-row">
                    <span className="settings-status-label">{label}</span>
                    <span className={`settings-status-value ${colorClass}`}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>
              <p className="settings-status-hint">
                API key is stored in this browser session only.
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-sm settings-signout-btn"
                onClick={() => {
                  clearAdminApiKey();
                  window.dispatchEvent(new Event('admin-auth-expired'));
                }}
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </div>
        </div>

        <GeminiModelSettings />

        <IntervalTriggerSettings />

        <RowRulesTable />

        <div className="card settings-card settings-danger-card">
          <div className="settings-section-header">
            <div className="settings-section-header-main">
              <div className="settings-section-title settings-danger-title">Danger Zone</div>
            </div>
          </div>
          <p className="settings-danger-text">
            Stops the Python backend on the server. You must restart the bot manually
            (e.g. <code>systemctl start videobot</code>).
          </p>
          <button
            type="button"
            className="settings-kill-btn"
            onClick={handleKillServer}
          >
            <AlertTriangle size={12} />
            Kill Server
          </button>
        </div>
      </div>
    </>
  );
}
