import { useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Save } from 'lucide-react';
import { fetchDriveMediaOptions, fetchRowRules, saveRowRules } from '../data/api';
import { invalidateCache, writeCache } from '../data/queryCache';
import { SETTINGS_ROW_RULES_CACHE_KEY } from '../data/settingsCacheKeys';
import SettingsTabStatus from './SettingsTabStatus';

function emptyRule() {
  return {
    batch_rows: '',
    from_row: '',
    to_row: '',
    background_video_id: '',
    background_video_name: '',
    thumbnail_file_id: '',
    thumbnail_name: '',
    background_loop_count: '',
  };
}

function ruleAnchorRow(batchRows) {
  const first = String(batchRows ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)[0];
  if (!first) return 0;
  const value = Number(first);
  return Number.isFinite(value) ? value : 0;
}

function parseBatchRowCount(raw) {
  if (!raw || !String(raw).trim()) return 0;
  return String(raw)
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function batchRowsFromLegacyRule(r) {
  if (r.batch_rows && String(r.batch_rows).trim()) {
    return String(r.batch_rows);
  }
  const from = r.from_row != null && r.from_row !== '' ? String(r.from_row) : '';
  const to = r.to_row != null && r.to_row !== '' ? String(r.to_row) : '';
  if (!from) return '';
  if (to && to !== from) {
    const start = Number(from);
    const end = Number(to);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return Array.from({ length: end - start + 1 }, (_, i) => start + i).join(', ');
    }
  }
  return from;
}

function mapRulesFromApi(rulesData) {
  return rulesData.rules?.length
    ? rulesData.rules.map((r) => ({
        batch_rows: batchRowsFromLegacyRule(r),
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
}

function SelectMedia({ id, value, options, disabled, onChange, title }) {
  return (
    <select
      id={id}
      className="form-input row-rules-select"
      value={value}
      disabled={disabled}
      onChange={onChange}
      title={
        title ?? options.find((o) => o.id === value)?.name ?? 'Default'
      }
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

export default function RowRulesTable({ embedded = false, query }) {
  const [rules, setRules] = useState([emptyRule()]);
  const [backgrounds, setBackgrounds] = useState([]);
  const [thumbnails, setThumbnails] = useState([]);
  const [saving, setSaving] = useState(false);
  const [refreshingDrive, setRefreshingDrive] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loading = query.isInitialLoad;
  const refreshing = query.refreshing;
  const rowDisabled = loading || refreshing || refreshingDrive || saving;

  const repeatAnchors = new Set(query.data?.rulesData?.repeat_anchors ?? []);

  useEffect(() => {
    const bundle = query.data;
    if (!bundle) return;
    setRules(mapRulesFromApi(bundle.rulesData));
    setBackgrounds(bundle.media.background_videos ?? []);
    setThumbnails(bundle.media.thumbnail_images ?? []);
    setError('');
  }, [query.data]);

  useEffect(() => {
    if (query.error) {
      setError(query.error);
    }
  }, [query.error]);

  const refreshDriveLists = async () => {
    setError('');
    setRefreshingDrive(true);
    try {
      const media = await fetchDriveMediaOptions();
      setBackgrounds(media.background_videos ?? []);
      setThumbnails(media.thumbnail_images ?? []);
      if (query.data) {
        writeCache(
          SETTINGS_ROW_RULES_CACHE_KEY,
          { ...query.data, media },
          60000,
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshingDrive(false);
    }
  };

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
        .filter((r) => r.batch_rows !== '' && r.batch_rows != null)
        .map((r) => {
          const batchRows = String(r.batch_rows).trim();
          const firstRow = batchRows.split(/[\s,]+/).filter(Boolean)[0];
          const anchorRow = ruleAnchorRow(batchRows);
          const isRepeatAnchor = repeatAnchors.has(anchorRow);
          return {
            from_row: Number(firstRow),
            to_row: null,
            batch_rows: batchRows,
            background_video_id: r.background_video_id || '',
            background_video_name:
              r.background_video_name ||
              backgrounds.find((b) => b.id === r.background_video_id)?.name ||
              '',
            thumbnail_file_id: isRepeatAnchor ? '' : r.thumbnail_file_id || '',
            thumbnail_name: isRepeatAnchor
              ? ''
              : r.thumbnail_name ||
                thumbnails.find((t) => t.id === r.thumbnail_file_id)?.name ||
                '',
            background_loop_count:
              parseBatchRowCount(batchRows) > 1 ||
              r.background_loop_count === '' ||
              r.background_loop_count == null
                ? null
                : Number(r.background_loop_count),
          };
        });
      const result = await saveRowRules(payload);
      const autoDoCount = result.auto_do_rows?.length ?? 0;
      setSuccess(
        autoDoCount
          ? `Row rules saved. ${autoDoCount} row(s) set to do in the sheet.`
          : 'Row rules saved.',
      );
      setTimeout(() => setSuccess(''), 3000);
      invalidateCache(SETTINGS_ROW_RULES_CACHE_KEY);
      await query.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const showTable = !loading;

  return (
    <div className={embedded ? 'settings-studio-panel' : 'card settings-card row-rules-card'}>
      <SettingsTabStatus loading={loading} refreshing={refreshing} label="row rules" />

      <div className="settings-section-header">
        <div className="settings-section-header-main">
          <div className={embedded ? 'settings-studio-panel-title settings-section-title' : 'settings-section-title'}>
            Row-based rules
          </div>
          <p className={embedded ? 'settings-studio-panel-subtitle' : 'settings-section-hint'}>
            Map sheet rows to background video, thumbnail, and loop count. First row in{' '}
            <strong>Select Rows</strong> is the anchor. Thumbnails for <code>repeat</code> rows are
            set under Jobs → Schedule → Repeat.
          </p>
          {!embedded && (
            <>
          <p className="settings-section-hint">
            Map sheet rows to a background (.mp4), thumbnail (<code>Thumbnails/</code>),
            and/or loop count. Use <strong>Select Rows</strong> with comma-separated sheet row
            numbers from the Jobs tab (first row is the anchor/trigger). Multiple rows concatenate
            audio into one render; member rows are marked complete automatically. Loops apply only
            to single-row rules.
          </p>
          <p className="settings-section-hint">
            Saving a background or thumbnail sets those rows to <code>do</code> in the sheet
            immediately (rows already <code>scheduled</code> or <code>repeat</code> are left
            unchanged). For batch jobs, schedule the <strong>anchor row</strong>.
          </p>
            </>
          )}
        </div>
        <div className="settings-section-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={refreshDriveLists}
            disabled={loading || refreshingDrive}
          >
            <RefreshCw size={14} className={refreshingDrive ? 'content-calendar-spin' : ''} />
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
        <p className="settings-feedback settings-feedback--error">
          {error}
        </p>
      )}
      {success && (
        <p className="settings-feedback settings-feedback--success">
          {success}
        </p>
      )}

      <div
        className={`settings-panel-body settings-panel-body--rules${loading ? ' is-loading' : ''}${refreshing ? ' is-refreshing' : ''}`}
        aria-busy={loading || refreshing}
      >
        {showTable ? (
          <div className="row-rules-list">
            <div className="row-rules-head" aria-hidden="true">
              <span>Select Rows</span>
              <span>Background</span>
              <span>Thumbnail</span>
              <span>Loops</span>
              <span />
            </div>
            {rules.map((rule, index) => {
              const batchCount = parseBatchRowCount(rule.batch_rows);
              const isMultiBatch = batchCount > 1;
              const anchorRow = ruleAnchorRow(rule.batch_rows);
              const isRepeatAnchor = repeatAnchors.has(anchorRow);
              return (
                <div key={index} className="row-rules-row">
                  <div className="row-rules-field">
                    <label className="row-rules-field-label" htmlFor={`rows-${index}`}>
                      Select Rows
                    </label>
                    <input
                      id={`rows-${index}`}
                      className="form-input row-rules-rows"
                      type="text"
                      placeholder="70, 601, 805"
                      aria-label={`Rule ${index + 1} select rows`}
                      title="Comma-separated sheet row numbers; first row is the anchor"
                      value={rule.batch_rows}
                      disabled={rowDisabled}
                      onChange={(e) =>
                        updateRule(index, {
                          batch_rows: e.target.value.replace(/[^\d,\s]/g, ''),
                        })
                      }
                    />
                  </div>
                  <div className="row-rules-field">
                    <label className="row-rules-field-label" htmlFor={`bg-${index}`}>
                      Background
                    </label>
                    <SelectMedia
                      id={`bg-${index}`}
                      value={rule.background_video_id}
                      options={backgrounds}
                      disabled={rowDisabled}
                      onChange={(e) => {
                        const opt = backgrounds.find((b) => b.id === e.target.value);
                        updateRule(index, {
                          background_video_id: e.target.value,
                          background_video_name: opt?.name ?? '',
                        });
                      }}
                    />
                  </div>
                  <div className="row-rules-field">
                    <label className="row-rules-field-label" htmlFor={`thumb-${index}`}>
                      Thumbnail
                    </label>
                    <SelectMedia
                      id={`thumb-${index}`}
                      value={isRepeatAnchor ? '' : rule.thumbnail_file_id}
                      options={thumbnails}
                      disabled={rowDisabled || isRepeatAnchor}
                      title={
                        isRepeatAnchor
                          ? 'Repeat row — set thumbnails in Jobs → Schedule → Repeat'
                          : undefined
                      }
                      onChange={(e) => {
                        const opt = thumbnails.find((t) => t.id === e.target.value);
                        updateRule(index, {
                          thumbnail_file_id: e.target.value,
                          thumbnail_name: opt?.name ?? '',
                        });
                      }}
                    />
                  </div>
                  <div className="row-rules-field">
                    <label className="row-rules-field-label" htmlFor={`loops-${index}`}>
                      Loops
                    </label>
                    <input
                      id={`loops-${index}`}
                      className="form-input row-rules-num"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Auto"
                      aria-label={`Rule ${index + 1} background loops`}
                      title={
                        isMultiBatch
                          ? 'Batch mode uses auto background loop over combined audio'
                          : 'Repeat audio and background N times (empty = auto)'
                      }
                      value={isMultiBatch ? '' : rule.background_loop_count}
                      disabled={rowDisabled || isMultiBatch}
                      onChange={(e) =>
                        updateRule(index, {
                          background_loop_count: e.target.value.replace(/\D/g, ''),
                        })
                      }
                    />
                  </div>
                  <div className="row-rules-row-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm job-action-btn row-rules-delete"
                      onClick={() => removeRule(index)}
                      title="Remove rule"
                      aria-label="Remove rule"
                      disabled={rowDisabled}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="settings-panel-skeleton settings-panel-skeleton--rules" aria-hidden="true">
            <div className="settings-panel-skeleton-row" />
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-sm row-rules-add-btn"
        onClick={addRule}
        disabled={loading || refreshing}
      >
        <Plus size={14} /> Add rule
      </button>
    </div>
  );
}
