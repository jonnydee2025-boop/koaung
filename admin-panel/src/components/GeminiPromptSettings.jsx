import { useEffect, useState } from 'react';
import { fetchGeminiPrompt, saveGeminiPrompt } from '../data/api';
import { Save, Sparkles } from 'lucide-react';

const DEFAULT_SCHEMA_TEXT = `{
  "type": "object",
  "properties": {
    "intro": { "type": "string" },
    "copyright_disclaimer": { "type": "string" },
    "keywords": { "type": "string" },
    "hashtags": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["intro", "copyright_disclaimer", "keywords", "hashtags"]
}`;

export default function GeminiPromptSettings() {
  const [channelBrand, setChannelBrand] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPromptTemplate, setUserPromptTemplate] = useState('');
  const [responseSchemaText, setResponseSchemaText] = useState(DEFAULT_SCHEMA_TEXT);
  const [descriptionTemplate, setDescriptionTemplate] = useState('');
  const [tagsField, setTagsField] = useState('keywords');
  const [hashtagsField, setHashtagsField] = useState('hashtags');
  const [persisted, setPersisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetchGeminiPrompt()
      .then((data) => {
        setChannelBrand(data.channel_brand ?? '');
        setTemperature(Number(data.temperature ?? 0.7));
        setSystemPrompt(data.system_prompt ?? '');
        setUserPromptTemplate(data.user_prompt_template ?? '');
        setResponseSchemaText(JSON.stringify(data.response_schema ?? {}, null, 2));
        setDescriptionTemplate(data.description_template ?? '');
        setTagsField(data.tags_field ?? 'keywords');
        setHashtagsField(data.hashtags_field ?? 'hashtags');
        setPersisted(Boolean(data.persisted));
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
    let responseSchema;
    try {
      responseSchema = JSON.parse(responseSchemaText);
      if (!responseSchema || typeof responseSchema !== 'object' || Array.isArray(responseSchema)) {
        throw new Error('response_schema must be a JSON object.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON in response schema.');
      setSaving(false);
      return;
    }

    try {
      const result = await saveGeminiPrompt({
        channel_brand: channelBrand.trim(),
        temperature: Number(temperature),
        system_prompt: systemPrompt,
        user_prompt_template: userPromptTemplate,
        response_schema: responseSchema,
        description_template: descriptionTemplate,
        tags_field: tagsField.trim(),
        hashtags_field: hashtagsField.trim(),
      });
      setPersisted(true);
      setSaved(true);
      setResponseSchemaText(JSON.stringify(result.response_schema ?? responseSchema, null, 2));
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card settings-card">
      <div className="settings-section-header">
        <div className="settings-section-header-main">
          <div className="settings-section-title">
            <Sparkles size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            Gemini YouTube Prompt
          </div>
          <div className="settings-section-subtitle">
            Edit the system prompt, user template, and JSON schema Gemini must return.
            Placeholders: {'{monk_name}'}, {'{dhamma_title}'}, {'{channel_brand}'}, {'{hashtags_line}'}.
          </div>
        </div>
      </div>

      {loading ? (
        <p className="settings-gemini-hint">Loading prompt settings…</p>
      ) : (
        <>
          <div className="settings-gemini-grid">
            <div>
              <label className="form-label" htmlFor="gemini-channel-brand">
                Channel brand
              </label>
              <input
                id="gemini-channel-brand"
                className="form-input"
                value={channelBrand}
                onChange={(e) => setChannelBrand(e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="gemini-temperature">
                Temperature
              </label>
              <input
                id="gemini-temperature"
                className="form-input"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <label className="form-label" htmlFor="gemini-system-prompt">
            System prompt
          </label>
          <textarea
            id="gemini-system-prompt"
            className="form-input settings-gemini-prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            disabled={saving}
            rows={8}
          />

          <label className="form-label" htmlFor="gemini-user-prompt">
            User prompt template
          </label>
          <textarea
            id="gemini-user-prompt"
            className="form-input settings-gemini-prompt"
            value={userPromptTemplate}
            onChange={(e) => setUserPromptTemplate(e.target.value)}
            disabled={saving}
            rows={4}
          />

          <label className="form-label" htmlFor="gemini-response-schema">
            Response JSON schema (Gemini structured output)
          </label>
          <textarea
            id="gemini-response-schema"
            className="form-input settings-gemini-schema"
            value={responseSchemaText}
            onChange={(e) => setResponseSchemaText(e.target.value)}
            disabled={saving}
            rows={12}
            spellCheck={false}
          />

          <div className="settings-gemini-grid">
            <div>
              <label className="form-label" htmlFor="gemini-description-template">
                Description template
              </label>
              <textarea
                id="gemini-description-template"
                className="form-input settings-gemini-prompt"
                value={descriptionTemplate}
                onChange={(e) => setDescriptionTemplate(e.target.value)}
                disabled={saving}
                rows={4}
              />
              <p className="settings-gemini-hint">
                Use field names from your JSON schema. {'{hashtags_line}'} formats the hashtags array.
              </p>
            </div>
            <div>
              <label className="form-label" htmlFor="gemini-tags-field">
                Tags field
              </label>
              <input
                id="gemini-tags-field"
                className="form-input"
                value={tagsField}
                onChange={(e) => setTagsField(e.target.value)}
                disabled={saving}
              />
              <label className="form-label" htmlFor="gemini-hashtags-field" style={{ marginTop: 12 }}>
                Hashtags field
              </label>
              <input
                id="gemini-hashtags-field"
                className="form-input"
                value={hashtagsField}
                onChange={(e) => setHashtagsField(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="settings-gemini-meta">
            <span>{persisted ? 'Saved on server' : 'Using built-in defaults'}</span>
          </div>

          {error && <p className="settings-error">{error}</p>}

          <div className="settings-card-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={14} />
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save prompt'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
