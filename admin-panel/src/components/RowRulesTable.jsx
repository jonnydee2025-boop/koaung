import { useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Save } from 'lucide-react';
import { fetchDriveMediaOptions, fetchRowRules, saveRowRules } from '../data/api';

function emptyRule() {
  return {
    from_row: '',
    to_row: '',
    background_video_id: '',
    background_video_name: '',
    thumbnail_file_id: '',
    thumbnail_name: '',
    background_loop_count: '',
  };
}

function SelectMedia({ id, value, options, disabled, onChange }) {
  return (
    <select
      id={id}
      className="form-input row-rules-select"
      value={value}
      disabled={disabled}
      onChange={onChange}
      title={options.find((o) => o.id === value)?.name ?? 'Default'}
    >
      <option value="">— Default —</option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.name}
        </option>
      ))}
    </select>
  );
}

export default function RowRulesTable() {
  const [rules, setRules] = useState([emptyRule()]);
  const [backgrounds, setBackgrounds] = useState([]);
  const [thumbnails, setThumbnails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingDrive, setRefreshingDrive] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadAll = async ({ refreshDrive = false } = {}) => {
    setError('');
    if (refreshDrive) {
      setRefreshingDrive(true);
    } else {
      setLoading(true);
    }
    try {
      const [rulesData, media] = await Promise.all([
        fetchRowRules(),
        fetchDriveMediaOptions(),
      ]);
      const loaded = rulesData.rules?.length
        ? rulesData.rules.map((r) => ({
            from_row: r.from_row ?? '',
            to_row: r.to_row ?? '',
            background_video_id: r.background_video_id ?? '',
            background_video_name: r.background_video_name ?? '',
            thumbnail_file_id: r.thumbnail_file_id ?? '',
            thumbnail_name: r.thumbnail_name ?? '',
            background_loop_count:
              r.background_loop_count != null && r.background_loop_count !== ''
                ? String(r.background_loop_count)
                : '',
          }))
        : [emptyRule()];
      setRules(loaded);
      setBackgrounds(media.background_videos ?? []);
      setThumbnails(media.thumbnail_images ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshingDrive(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const updateRule = (index, patch) => {
    setRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    );
  };

  const addRule = () => setRules((prev) => [...prev, emptyRule()]);

  const removeRule = (index) => {
    setRules((prev) => (prev.length <= 1 ? [emptyRule()] : prev.filter((_, i) => i !== index)));
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const payload = rules
        .filter((r) => r.from_row !== '' && r.from_row != null)
        .map((r) => ({
          from_row: Number(r.from_row),
          to_row:
            r.to_row === '' || r.to_row == null ? null : Number(r.to_row),
          background_video_id: r.background_video_id || '',
          background_video_name:
            r.background_video_name ||
            backgrounds.find((b) => b.id === r.background_video_id)?.name ||
            '',
          thumbnail_file_id: r.thumbnail_file_id || '',
          thumbnail_name:
            r.thumbnail_name ||
            thumbnails.find((t) => t.id === r.thumbnail_file_id)?.name ||
            '',
          background_loop_count:
            r.background_loop_count === '' || r.background_loop_count == null
              ? null
              : Number(r.background_loop_count),
        }));
      await saveRowRules(payload);
      setSuccess('Row rules saved.');
      setTimeout(() => setSuccess(''), 3000);
      await loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card row-rules-card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="card-title">Row-Based Rules</div>
          <p className="modal-hint" style={{ marginTop: 6, marginBottom: 0 }}>
            Map sheet row ranges to a background (.mp4), thumbnail (<code>Thumbnails/</code>),
            and/or loop count. Use the <strong>sheet row number</strong> from the Jobs tab
            (starts at 2 for the first data row). Overlapping rules may split background vs
            thumbnail; later rules override earlier ones for the same field.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => loadAll({ refreshDrive: true })}
            disabled={loading || refreshingDrive}
          >
            <RefreshCw size={14} />
            Refresh Drive lists
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={loading || saving}
          >
            <Save size={14} />
            {saving ? 'Saving…' : 'Save rules'}
          </button>
        </div>
      </div>

      {error && (
        <p className="login-error" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}
      {success && (
        <p style={{ color: 'var(--green)', fontSize: 12, marginBottom: 12 }}>
          {success}
        </p>
      )}

      {loading ? (
        <p className="text-muted" style={{ fontSize: 13 }}>
          Loading rules and Drive files…
        </p>
      ) : (
        <div className="row-rules-list">
          <div className="row-rules-head" aria-hidden="true">
            <span>From</span>
            <span>To</span>
            <span>Background</span>
            <span>Thumbnail</span>
            <span>Loops</span>
            <span />
          </div>
          {rules.map((rule, index) => (
            <div key={index} className="row-rules-row">
              <input
                className="form-input row-rules-num"
                type="number"
                min={1}
                placeholder="100"
                aria-label={`Rule ${index + 1} from row`}
                value={rule.from_row}
                onChange={(e) => updateRule(index, { from_row: e.target.value })}
              />
              <input
                className="form-input row-rules-num"
                type="number"
                min={1}
                placeholder="—"
                aria-label={`Rule ${index + 1} to row`}
                value={rule.to_row}
                onChange={(e) => updateRule(index, { to_row: e.target.value })}
              />
              <SelectMedia
                id={`bg-${index}`}
                value={rule.background_video_id}
                options={backgrounds}
                disabled={refreshingDrive}
                onChange={(e) => {
                  const opt = backgrounds.find((b) => b.id === e.target.value);
                  updateRule(index, {
                    background_video_id: e.target.value,
                    background_video_name: opt?.name ?? '',
                  });
                }}
              />
              <SelectMedia
                id={`thumb-${index}`}
                value={rule.thumbnail_file_id}
                options={thumbnails}
                disabled={refreshingDrive}
                onChange={(e) => {
                  const opt = thumbnails.find((t) => t.id === e.target.value);
                  updateRule(index, {
                    thumbnail_file_id: e.target.value,
                    thumbnail_name: opt?.name ?? '',
                  });
                }}
              />
              <input
                className="form-input row-rules-num"
                type="number"
                min={1}
                max={500}
                placeholder="Auto"
                aria-label={`Rule ${index + 1} background loops`}
                title="Repeat audio and background N times (empty = auto)"
                value={rule.background_loop_count}
                onChange={(e) =>
                  updateRule(index, { background_loop_count: e.target.value })
                }
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm job-action-btn row-rules-delete"
                onClick={() => removeRule(index)}
                title="Remove rule"
                aria-label="Remove rule"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginTop: 12 }}
        onClick={addRule}
        disabled={loading}
      >
        <Plus size={14} /> Add rule
      </button>
    </div>
  );
}
