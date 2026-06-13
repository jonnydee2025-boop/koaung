import { useEffect, useMemo, useRef, useState } from 'react';
import { saveGeminiModels } from '../data/api';
import { invalidateCache } from '../data/queryCache';
import { SETTINGS_GEMINI_CACHE_KEY } from '../data/settingsCacheKeys';
import { useToast } from '../context/ToastContext';
import { GripVertical, Plus, Save, Sparkles, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import SettingsTabStatus from './SettingsTabStatus';
import LoadingOverlay from './LoadingOverlay';
import OptionSelectDropdown from './OptionSelectDropdown';

const DEFAULT_PRIMARY_MODEL = 'gemini-2.5-flash';

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

function reorderList(items, fromIndex, toIndex) {
  if (fromIndex === toIndex) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function FallbackModelList({ models, disabled, onReorder, onRemove }) {
  const dragIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const moveItem = (from, to) => {
    if (to < 0 || to >= models.length || from === to) return;
    onReorder(from, to);
  };

  const handleDragStart = (index) => (event) => {
    dragIndexRef.current = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (index) => (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (index) => (event) => {
    event.preventDefault();
    const from = dragIndexRef.current;
    if (from != null && from !== index) {
      onReorder(from, index);
    }
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  if (models.length === 0) {
    return <p className="settings-gemini-hint gemini-fallback-empty">No backup models yet.</p>;
  }

  return (
    <ul className="gemini-fallback-list" aria-label="Fallback models try order">
      {models.map((model, index) => (
        <li
          key={model}
          className={`gemini-fallback-item${dragOverIndex === index ? ' is-drag-over' : ''}`}
          draggable={!disabled}
          onDragStart={handleDragStart(index)}
          onDragOver={handleDragOver(index)}
          onDrop={handleDrop(index)}
          onDragEnd={handleDragEnd}
        >
          <span className="gemini-fallback-drag" aria-hidden="true">
            <GripVertical size={16} />
          </span>
          <span className="gemini-fallback-chip">{model}</span>
          <div className="gemini-fallback-move-btns">
            <button
              type="button"
              className="btn btn-ghost btn-sm job-action-btn gemini-fallback-move"
              onClick={() => moveItem(index, index - 1)}
              disabled={disabled || index === 0}
              aria-label={`Move ${model} up`}
              title="Move up"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm job-action-btn gemini-fallback-move"
              onClick={() => moveItem(index, index + 1)}
              disabled={disabled || index === models.length - 1}
              aria-label={`Move ${model} down`}
              title="Move down"
            >
              <ChevronDown size={14} />
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm job-action-btn gemini-fallback-delete"
            onClick={() => onRemove(index)}
            disabled={disabled}
            aria-label={`Remove ${model}`}
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function GeminiModelSettings({ embedded = false, query }) {
  const { showSuccess, showError } = useToast();
  const [primaryModel, setPrimaryModel] = useState(DEFAULT_PRIMARY_MODEL);
  const [fallbackModels, setFallbackModels] = useState([]);
  const [knownModels, setKnownModels] = useState([]);
  const [addModelValue, setAddModelValue] = useState('');
  const [apiKeyInputs, setApiKeyInputs] = useState([]);
  const [apiKeyPreviews, setApiKeyPreviews] = useState([]);
  const [apiKeyCount, setApiKeyCount] = useState(0);
  const [apiKeyFromEnv, setApiKeyFromEnv] = useState(false);
  const [apiKeysPersisted, setApiKeysPersisted] = useState(false);
  const [persisted, setPersisted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loading = query.isInitialLoad;
  const refreshing = query.refreshing;
  const formDisabled = loading || refreshing || saving;

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setPrimaryModel(data.primary_model?.trim() || DEFAULT_PRIMARY_MODEL);
    setFallbackModels(Array.isArray(data.fallback_models) ? [...data.fallback_models] : []);
    setKnownModels(data.known_models ?? []);
    setPersisted(Boolean(data.persisted));
    setApiKeyPreviews(data.api_key_previews ?? []);
    setApiKeyCount(data.api_key_count ?? 0);
    setApiKeyFromEnv(Boolean(data.api_key_from_env));
    setApiKeysPersisted(Boolean(data.api_keys_persisted));
    setApiKeyInputs(buildInitialKeyRows(data));
    setAddModelValue('');
  }, [query.data]);

  const modelOptions = useMemo(() => {
    const merged = new Set([
      DEFAULT_PRIMARY_MODEL,
      ...knownModels,
      primaryModel,
      ...fallbackModels,
    ]);
    return [...merged].filter(Boolean).sort();
  }, [knownModels, primaryModel, fallbackModels]);

  const addableModels = useMemo(
    () =>
      modelOptions.filter(
        (model) =>
          model !== primaryModel &&
          !fallbackModels.some((item) => item.toLowerCase() === model.toLowerCase()),
      ),
    [modelOptions, primaryModel, fallbackModels],
  );

  const primaryModelOptions = useMemo(
    () => modelOptions.map((model) => ({ value: model, label: model })),
    [modelOptions],
  );

  const addableModelOptions = useMemo(
    () => addableModels.map((model) => ({ value: model, label: model })),
    [addableModels],
  );

  const updateApiKeyInput = (index, value) => {
    setApiKeyInputs((rows) => rows.map((row, i) => (i === index ? value : row)));
  };

  const addApiKeyRow = () => {
    setApiKeyInputs((rows) => [...rows, '']);
  };

  const removeApiKeyRow = (index) => {
    setApiKeyInputs((rows) => rows.filter((_, i) => i !== index));
  };

  const handlePrimaryChange = (value) => {
    setPrimaryModel(value);
    setFallbackModels((prev) =>
      prev.filter((model) => model.toLowerCase() !== value.toLowerCase()),
    );
  };

  const handleAddFallbackModel = (value) => {
    if (!value) return;
    if (value.toLowerCase() === primaryModel.toLowerCase()) return;
    if (fallbackModels.some((model) => model.toLowerCase() === value.toLowerCase())) return;
    setFallbackModels((prev) => [...prev, value]);
    setAddModelValue('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        primary_model: primaryModel.trim(),
        fallback_models: fallbackModels,
        api_keys: apiKeyInputs,
      };
      const result = await saveGeminiModels(payload);
      setPrimaryModel(result.primary_model?.trim() || DEFAULT_PRIMARY_MODEL);
      setFallbackModels(Array.isArray(result.fallback_models) ? [...result.fallback_models] : []);
      setPersisted(true);
      setApiKeyPreviews(result.api_key_previews ?? []);
      setApiKeyCount(result.api_key_count ?? 0);
      setApiKeyFromEnv(Boolean(result.api_key_from_env));
      setApiKeysPersisted(Boolean(result.api_keys_persisted));
      setApiKeyInputs(buildInitialKeyRows(result));
      setSaved(true);
      showSuccess('Gemini settings saved.');
      invalidateCache(SETTINGS_GEMINI_CACHE_KEY);
      await query.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      showError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const showForm = !loading;
  const apiKeyStatus =
    apiKeyCount > 0
      ? `${apiKeyCount} configured${apiKeyFromEnv && !apiKeysPersisted ? ' (1 from .env)' : ''}`
      : 'Not set';

  return (
    <div className={`gemini-settings-page${embedded ? ' gemini-settings-page--embedded' : ''}`}>
      <SettingsTabStatus loading={loading} refreshing={refreshing} label="AI settings" />

      <div className="settings-section-header gemini-settings-intro">
        <div className="settings-section-header-main">
          <div
            className={
              embedded ? 'settings-studio-panel-title settings-section-title' : 'settings-section-title'
            }
          >
            <Sparkles size={16} className="settings-section-icon" />
            Gemini model fallback
          </div>
          <div className={embedded ? 'settings-studio-panel-subtitle' : 'settings-section-subtitle'}>
            Primary model first, then fallbacks if the API call fails. YouTube metadata prompt
            loads from <code>gemini_youtube_prompt_spec.json</code> on the server.
          </div>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary gemini-settings-save-btn"
        onClick={handleSave}
        disabled={formDisabled || !primaryModel.trim()}
      >
        <Save size={14} />
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save settings'}
      </button>

      <LoadingOverlay
        loading={loading}
        label="Loading AI settings…"
        className={`settings-panel-body settings-panel-body--ai${refreshing ? ' is-refreshing' : ''}`}
      >
        {showForm ? (
          <>
            <section className="gemini-settings-section card">
              <h3 className="gemini-settings-section-title">API keys (failover order)</h3>
              <p className="settings-gemini-hint">
                Key 1 is tried first. If quota is exceeded, key 2 is used automatically. Leave a
                field blank to keep the existing key at that slot.
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
                className="btn btn-ghost btn-sm gemini-add-api-key-btn"
                onClick={addApiKeyRow}
                disabled={formDisabled}
              >
                <Plus size={14} />
                Add API key
              </button>
            </section>

            <section className="gemini-settings-section card">
              <div className="form-group">
                <label className="form-label gemini-field-label" htmlFor="gemini-primary-model">
                  Primary model (used first)
                </label>
                <OptionSelectDropdown
                  id="gemini-primary-model"
                  className="gemini-primary-select-dropdown"
                  value={primaryModel}
                  options={primaryModelOptions}
                  disabled={formDisabled}
                  ariaLabel="Primary Gemini model"
                  onChange={handlePrimaryChange}
                />
              </div>

              <div className="form-group gemini-fallback-group">
                <label className="form-label gemini-field-label">
                  Fallback models (drag-and-drop try order)
                </label>
                <FallbackModelList
                  models={fallbackModels}
                  disabled={formDisabled}
                  onReorder={(from, to) =>
                    setFallbackModels((prev) => reorderList(prev, from, to))
                  }
                  onRemove={(index) =>
                    setFallbackModels((prev) => prev.filter((_, i) => i !== index))
                  }
                />
                <div className="gemini-add-backup-row">
                  <span className="gemini-add-backup-label">
                    <Plus size={14} aria-hidden />
                    Add backup model
                  </span>
                  <OptionSelectDropdown
                    className="gemini-add-backup-select-dropdown"
                    value={addModelValue}
                    options={addableModelOptions}
                    allowEmpty
                    emptyLabel="Select model"
                    disabled={formDisabled || addableModels.length === 0}
                    ariaLabel="Select backup model to add"
                    onChange={handleAddFallbackModel}
                  />
                </div>
              </div>
            </section>

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
                <span
                  className={`settings-status-value ${
                    persisted ? 'settings-status-value--accent' : ''
                  }`}
                >
                  {persisted ? 'Yes' : 'Using .env defaults'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="settings-panel-placeholder" aria-hidden="true" />
        )}
      </LoadingOverlay>
    </div>
  );
}
