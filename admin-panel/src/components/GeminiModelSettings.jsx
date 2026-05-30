import { useEffect, useState } from 'react';
import { saveGeminiModels } from '../data/api';
import { invalidateCache } from '../data/queryCache';
import { SETTINGS_GEMINI_CACHE_KEY } from '../data/settingsCacheKeys';
import { Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import SettingsTabStatus from './SettingsTabStatus';

function parseFallbackText(text) {
  return text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildInitialKeyRows(data) {
  const previews = data?.api_key_previews ?? [];
  if (previews.length > 0) {
    return previews.map(() => '');
  }
  if (data?.api_key_configured && data?.api_key_from_env) {
    return [''];
  }
  return [];
}

export default function GeminiModelSettings({ embedded = false, query }) {
  const [primaryModel, setPrimaryModel] = useState('');
  const [fallbackText, setFallbackText] = useState('');
  const [knownModels, setKnownModels] = useState([]);
  const [modelChain, setModelChain] = useState([]);
  const [apiKeyInputs, setApiKeyInputs] = useState([]);
  const [apiKeyPreviews, setApiKeyPreviews] = useState([]);
  const [apiKeyCount, setApiKeyCount] = useState(0);
  const [apiKeyFromEnv, setApiKeyFromEnv] = useState(false);
  const [apiKeysPersisted, setApiKeysPersisted] = useState(false);
  const [persisted, setPersisted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const loading = query.isInitialLoad;
  const refreshing = query.refreshing;
  const formDisabled = loading || refreshing || saving;

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setPrimaryModel(data.primary_model ?? '');
    setFallbackText((data.fallback_models ?? []).join('\n'));
    setKnownModels(data.known_models ?? []);
    setModelChain(data.model_chain ?? []);
    setPersisted(Boolean(data.persisted));
    setApiKeyPreviews(data.api_key_previews ?? []);
    setApiKeyCount(data.api_key_count ?? 0);
    setApiKeyFromEnv(Boolean(data.api_key_from_env));
    setApiKeysPersisted(Boolean(data.api_keys_persisted));
    setApiKeyInputs(buildInitialKeyRows(data));
    setError('');
  }, [query.data]);

  useEffect(() => {
    if (query.error) {
      setError(query.error);
    }
  }, [query.error]);

  const updateApiKeyInput = (index, value) => {
    setApiKeyInputs((rows) => rows.map((row, i) => (i === index ? value : row)));
  };

  const addApiKeyRow = () => {
    setApiKeyInputs((rows) => [...rows, '']);
  };

  const removeApiKeyRow = (index) => {
    setApiKeyInputs((rows) => rows.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const payload = {
        primary_model: primaryModel.trim(),
        fallback_models: parseFallbackText(fallbackText),
        api_keys: apiKeyInputs,
      };
      const result = await saveGeminiModels(payload);
      setPrimaryModel(result.primary_model ?? primaryModel);
      setFallbackText((result.fallback_models ?? []).join('\n'));
      setModelChain(result.model_chain ?? []);
      setPersisted(true);
      setApiKeyPreviews(result.api_key_previews ?? []);
      setApiKeyCount(result.api_key_count ?? 0);
      setApiKeyFromEnv(Boolean(result.api_key_from_env));
      setApiKeysPersisted(Boolean(result.api_keys_persisted));
      setApiKeyInputs(buildInitialKeyRows(result));
      setSaved(true);
      invalidateCache(SETTINGS_GEMINI_CACHE_KEY);
      await query.refresh();
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

  const showForm = !loading;
  const apiKeyStatus =
    apiKeyCount > 0
      ? `${apiKeyCount} configured${apiKeyFromEnv && !apiKeysPersisted ? ' (1 from .env)' : ''}`
      : 'Not set';

  return (
    <div className={embedded ? 'settings-studio-panel' : 'card settings-card'}>
      <SettingsTabStatus loading={loading} refreshing={refreshing} label="AI settings" />

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
            disabled={formDisabled || !primaryModel.trim()}
          >
            <Save size={14} />
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save settings'}
          </button>
        </div>
      </div>

      {error && <div className="settings-alert settings-alert--error">{error}</div>}
      {saved && (
        <p className="settings-feedback settings-feedback--success">Gemini settings saved.</p>
      )}

      <div
        className={`settings-panel-body settings-panel-body--ai${loading ? ' is-loading' : ''}${refreshing ? ' is-refreshing' : ''}`}
        aria-busy={loading || refreshing}
      >
        {showForm ? (
          <>
            <div className="settings-gemini-keys">
              <div className="form-group">
                <label className="form-label">API keys (failover order)</label>
                <p className="settings-gemini-hint">
                  Key 1 is tried first. If quota is exceeded, key 2 is used automatically.
                  Leave a field blank to keep the existing key at that slot.
                </p>
                {apiKeyFromEnv && !apiKeysPersisted && apiKeyInputs.length === 1 && (
                  <p className="settings-gemini-hint">
                    1 key from <code>.env</code> — add more below and Save to store on server.
                  </p>
                )}
                {apiKeyInputs.map((value, index) => (
                  <div key={index} className="settings-gemini-key-row">
                    <span className="settings-gemini-key-index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div className="settings-gemini-key-field">
                      <input
                        type="password"
                        className="form-input"
                        value={value}
                        onChange={(e) => updateApiKeyInput(index, e.target.value)}
                        placeholder={
                          apiKeyPreviews[index]
                            ? `Current: ${apiKeyPreviews[index]}`
                            : 'Paste Gemini API key'
                        }
                        autoComplete="off"
                        disabled={formDisabled}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm job-action-btn"
                      onClick={() => removeApiKeyRow(index)}
                      disabled={formDisabled}
                      aria-label={`Remove API key ${index + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={addApiKeyRow}
                  disabled={formDisabled}
                >
                  <Plus size={14} />
                  Add API key
                </button>
              </div>
            </div>

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
                  disabled={formDisabled}
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
                  disabled={formDisabled}
                />
                <p className="settings-gemini-hint">One model per line or comma-separated.</p>
              </div>
            </div>

            <div className="settings-gemini-meta">
              <div className="settings-status-row">
                <span className="settings-status-label">API keys</span>
                <span
                  className={`settings-status-value ${
                    apiKeyCount > 0
                      ? 'settings-status-value--green'
                      : 'settings-status-value--yellow'
                  }`}
                >
                  {apiKeyStatus}
                </span>
              </div>
              <div className="settings-status-row">
                <span className="settings-status-label">Models saved on server</span>
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
        ) : (
          <div className="settings-panel-skeleton settings-panel-skeleton--ai" aria-hidden="true">
            <div className="settings-panel-skeleton-block" />
            <div className="settings-panel-skeleton-block settings-panel-skeleton-block--short" />
          </div>
        )}
      </div>
    </div>
  );
}
