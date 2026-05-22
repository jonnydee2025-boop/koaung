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
  };
}

function SelectMedia({ id, label, value, options, disabled, onChange }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="form-input"
        value={value}
        disabled={disabled}
        onChange={onChange}
      >
        <option value="">— Default —</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
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
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="card-title">Row-Based Rules</div>
          <p className="modal-hint" style={{ marginTop: 6, marginBottom: 0 }}>
            Map sheet row ranges to a specific background (.mp4 in Drive root) and/or
            thumbnail (.jpg/.png in the <code>Thumbnails</code> subfolder). First matching
            rule wins. Empty &quot;To Row&quot; = single row.
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
        <div className="row-rules-table-wrap">
          <table className="row-rules-table">
            <thead>
              <tr>
                <th>From Row</th>
                <th>To Row</th>
                <th>Background Video</th>
                <th>Thumbnail Image</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, index) => (
                <tr key={index}>
                  <td>
                    <input
                      className="form-input"
                      type="number"
                      min={1}
                      placeholder="e.g. 100"
                      value={rule.from_row}
                      onChange={(e) => updateRule(index, { from_row: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="form-input"
                      type="number"
                      min={1}
                      placeholder="optional"
                      value={rule.to_row}
                      onChange={(e) => updateRule(index, { to_row: e.target.value })}
                    />
                  </td>
                  <td>
                    <SelectMedia
                      id={`bg-${index}`}
                      label=""
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
                  </td>
                  <td>
                    <SelectMedia
                      id={`thumb-${index}`}
                      label=""
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
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm job-action-btn"
                      onClick={() => removeRule(index)}
                      title="Remove rule"
                      aria-label="Remove rule"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
