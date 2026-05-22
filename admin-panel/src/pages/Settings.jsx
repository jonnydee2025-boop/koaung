import { useState, useEffect } from 'react';
import Header from '../components/Header';
import RowRulesTable from '../components/RowRulesTable';
import { fetchSettings, shutdownServer } from '../data/api';
import { clearAdminApiKey } from '../data/adminAuth';
import { Save, Info, AlertTriangle, LogOut } from 'lucide-react';

export default function Settings() {
  const [cfg, setCfg]   = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSettings()
      .then(data => setCfg({
        sheetName: data.sheet_name,
        tmpRoot: data.tmp_root,
        ffmpegBin: data.ffmpeg_bin,
        ffprobeBin: data.ffprobe_bin,
        backgroundVideoFolder: data.background_video_folder,
        enableAudioEnhance: data.enable_audio_enhance,
        apiPort: data.api_port,
      }))
      .catch(e => setError(e.message));
  }, []);

  const update = (key, val) => setCfg(prev => ({ ...prev, [key]: val }));

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleKillServer = async () => {
    if (!window.confirm("Are you sure you want to completely shut down the Python bot? The web UI will lose connection until you restart the script from your terminal.")) return;
    try {
      await shutdownServer();
      setError('Shutdown signal sent. Server is stopping...');
    } catch (e) {
      setError('Failed to send shutdown signal: ' + e.message);
    }
  };

  return (
    <>
      <Header title="Settings" subtitle="Live config from bot" />
      <div className="page-content">
        {error && (
          <div style={{ background:'var(--red-dim)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'10px 16px', marginBottom:16, fontSize:13, color:'var(--red)' }}>
            ⚠ {error} — Is the bot running?
          </div>
        )}

        {/* Read-only notice */}
        <div style={{ background:'var(--blue-dim)', border:'1px solid rgba(59,130,246,0.25)', borderRadius:8, padding:'10px 16px', marginBottom:20, fontSize:12, color:'var(--blue)', display:'flex', gap:8 }}>
          <Info size={14} style={{ flexShrink:0, marginTop:1 }} />
          General options below are read from <code>.env</code> (restart bot after edits). Row-Based Rules are saved on the server and used immediately for renders.
        </div>

        <div className="grid-2" style={{ alignItems:'start' }}>
          {/* General */}
          <div className="card">
            <div className="card-header"><div className="card-title">General Configuration</div></div>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {[
                ['cfg-sheet-name',   'Sheet Name (GOOGLE_SHEET_NAME)',           'sheetName'],
                ['cfg-tmp-root',     'Temp Directory (TMP_ROOT)',                 'tmpRoot'],
                ['cfg-ffmpeg',       'FFmpeg Binary (FFMPEG_BIN)',                'ffmpegBin'],
                ['cfg-ffprobe',      'FFprobe Binary (FFPROBE_BIN)',              'ffprobeBin'],
                ['cfg-drive-folder', 'Background Video Drive Folder',             'backgroundVideoFolder'],
                ['cfg-api-port',     'Admin API Port (API_PORT)',                 'apiPort'],
              ].map(([id, label, key]) => (
                <div key={id} className="form-group">
                  <label className="form-label">{label}</label>
                  <input id={id} className="form-input"
                    value={cfg ? (cfg[key] ?? '') : 'Loading…'}
                    onChange={e => update(key, e.target.value)}
                    readOnly={!cfg}
                    style={{ opacity: cfg ? 1 : 0.5 }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Toggles + note */}
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <div className="card">
              <div className="card-header"><div className="card-title">Feature Flags</div></div>
              <div>
                {[
                  { key:'enableAudioEnhance', label:'Audio Enhancement', desc:'FFmpeg voice EQ + loudness normalization (ENABLE_AUDIO_ENHANCE)' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="toggle-row">
                    <div className="toggle-info">
                      <div className="toggle-label">{label}</div>
                      <div className="toggle-desc">{desc}</div>
                    </div>
                    <label className="toggle">
                      <input id={`toggle-${key}`} type="checkbox"
                        checked={cfg ? Boolean(cfg[key]) : false}
                        onChange={e => update(key, e.target.checked)}
                        disabled={!cfg} />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">Admin session</div></div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Your API key is stored in this browser tab only (session). Sign out to require the key again.
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  clearAdminApiKey();
                  window.dispatchEvent(new Event('admin-auth-expired'));
                }}
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">API Status</div></div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  ['API Server', cfg ? `http://localhost:${cfg.apiPort}` : '…', '#22c55e'],
                  ['Swagger UI', cfg ? `http://localhost:${cfg.apiPort}/docs` : '…', 'var(--accent)'],
                  ['Health', cfg ? '✓ Connected' : 'Connecting…', '#22c55e'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ color:'var(--text-muted)' }}>{label}</span>
                    <span style={{ color, fontWeight:600 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <button id="btn-save-settings" className="btn btn-primary"
              onClick={handleSave}
              style={{ width:'100%', justifyContent:'center', marginBottom: 12 }}
              disabled={!cfg}>
              <Save size={15} />
              {saved ? '✓ Values noted (edit .env to persist)' : 'Acknowledge'}
            </button>

            <div className="card" style={{ borderColor: 'var(--red-dim)', background: 'rgba(239, 68, 68, 0.05)' }}>
              <div className="card-header"><div className="card-title" style={{ color: 'var(--red)' }}>Danger Zone</div></div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Completely shut down the Python backend process. You will need to manually restart the bot from your terminal.
              </p>
              <button 
                className="btn" 
                onClick={handleKillServer}
                style={{ width:'100%', justifyContent:'center', background: 'var(--red)', color: '#fff', border: 'none' }}
              >
                <AlertTriangle size={15} />
                Kill Server
              </button>
            </div>
          </div>
        </div>

        <RowRulesTable />
      </div>
    </>
  );
}
