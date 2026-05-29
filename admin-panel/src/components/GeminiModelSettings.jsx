import { useEffect, useState } from 'react';
import { fetchGeminiModels, saveGeminiModels } from '../data/api';
import { Save, Sparkles } from 'lucide-react';

function parseFallbackText(text) {
  return text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function GeminiModelSettings({ embedded = false }) {
  const [primaryModel, setPrimaryModel] = useState('');
  const [fallbackText, setFallbackText] = useState('');
  const [knownModels, setKnownModels] = useState([]);
  const [modelChain, setModelChain] = useState([]);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [persisted, setPersisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetchGeminiModels()
      .then((data) => {
        setPrimaryModel(data.primary_model ?? '');
        setFallbackText((data.fallback_models ?? []).join('\n'));
        setKnownModels(data.known_models ?? []);
        setModelChain(data.model_chain ?? []);
        setPersisted(Boolean(data.persisted));
        setApiKeyConfigured(Boolean(data.api_key_configured));
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const result = await saveGeminiModels({
        primary_model: primaryModel.trim(),
        fallback_models: parseFallbackText(fallbackText),
      });
      setPrimaryModel(result.primary_model ?? primaryModel);
      setFallbackText((result.fallback_models ?? []).join('\n'));
      setModelChain(result.model_chain ?? []);
      setPersisted(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const previewChain = [
    primaryModel.trim(),
    ...parseFallbackText(fallbackText).filter(
      (model) => model.toLowerCase() !== primaryModel.trim().toLowerCase(),
    ),
  ].filter(Boolean);

  return (
    <div className={embedded ? 'settings-studio-panel' : 'card settings-card'}>
      <div className="settings-section-header">
        <div className="settings-section-header-main">
          <div className={embedded ? 'settings-studio-panel-title settings-section-title' : 'settings-section-title'}>
            <Sparkles size={16} className="settings-section-icon" />
            Gemini model fallback
          </div>
          <div className={embedded ? 'settings-studio-panel-subtitle' : 'settings-section-subtitle'}>
            Primary model first, then fallbacks if the API call fails. YouTube metadata prompt
            loads from <code>gemini_youtube_prompt_spec.json</code> on the server.
          </div>
        </div>
        <div className="settings-section-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={loading || saving || !primaryModel.trim()}
          >
            <Save size={14} />
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save models'}
          </button>
        </div>
      </div>

      {error && <div className="settings-alert settings-alert--error">{error}</div>}
      {saved && (
        <p className="settings-feedback settings-feedback--success">Model settings saved.</p>
      )}

      {loading ? (
        <p className="settings-loading-text">Loading Gemini model settings…</p>
      ) : (
        <>
      <div className="settings-gemini-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="gemini-primary-model">
            Primary model
          </label>
          <input
            id="gemini-primary-model"
            className="form-input"
            list="gemini-model-options"
            value={primaryModel}
            onChange={(e) => setPrimaryModel(e.target.value)}
            placeholder="gemini-2.5-flash"
            disabled={loading || saving}
          />
          <datalist id="gemini-model-options">
            {knownModels.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="gemini-fallback-models">
            Fallback models
          </label>
          <textarea
            id="gemini-fallback-models"
            className="form-input settings-gemini-fallbacks"
            rows={4}
            value={fallbackText}
            onChange={(e) => setFallbackText(e.target.value)}
            placeholder={'gemini-2.0-flash\ngemini-1.5-flash'}
            disabled={loading || saving}
          />
          <p className="settings-gemini-hint">One model per line or comma-separated.</p>
        </div>
      </div>

      <div className="settings-gemini-meta">
        <div className="settings-status-row">
          <span className="settings-status-label">API key</span>
          <span
            className={`settings-status-value ${
              apiKeyConfigured ? 'settings-status-value--green' : 'settings-status-value--yellow'
            }`}
          >
            {apiKeyConfigured ? 'Configured' : 'Not set in .env'}
          </span>
        </div>
        <div className="settings-status-row">
          <span className="settings-status-label">Saved on server</span>
          <span className="settings-status-value">
            {persisted ? 'Yes' : 'Using .env defaults'}
          </span>
        </div>
        <div className="settings-gemini-chain">
          <span className="settings-status-label">Try order</span>
          <div className="settings-gemini-chain-list">
            {(previewChain.length ? previewChain : modelChain).map((model, index) => (
              <span key={`${model}-${index}`} className="settings-gemini-chip">
                {index + 1}. {model}
              </span>
            ))}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
