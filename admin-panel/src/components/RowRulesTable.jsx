import { useEffect, useState } from 'react';
import { Pencil, Trash2, RefreshCw, Save } from 'lucide-react';
import { fetchDriveMediaOptions, saveRowRules } from '../data/api';
import { invalidateCache, writeCache } from '../data/queryCache';
import { SETTINGS_ROW_RULES_CACHE_KEY } from '../data/settingsCacheKeys';
import SettingsTabStatus from './SettingsTabStatus';
import LoadingOverlay from './LoadingOverlay';
import MediaSelectDropdown from './MediaSelectDropdown';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

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
  const rules = rulesData?.rules;
  if (!rules?.length) {
    return [];
  }
  return rules.map((r) => ({
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
  }));
}

function ruleToPayload(rule, backgrounds, thumbnails, repeatAnchors) {
  const batchRows = String(rule.batch_rows).trim();
  const firstRow = batchRows.split(/[\s,]+/).filter(Boolean)[0];
  const anchorRow = ruleAnchorRow(batchRows);
  const isRepeatAnchor = repeatAnchors.has(anchorRow);
  return {
    from_row: Number(firstRow),
    to_row: null,
    batch_rows: batchRows,
    background_video_id: rule.background_video_id || '',
    background_video_name:
      rule.background_video_name ||
      backgrounds.find((b) => b.id === rule.background_video_id)?.name ||
      '',
    thumbnail_file_id: isRepeatAnchor ? '' : rule.thumbnail_file_id || '',
    thumbnail_name: isRepeatAnchor
      ? ''
      : rule.thumbnail_name ||
        thumbnails.find((t) => t.id === rule.thumbnail_file_id)?.name ||
        '',
    background_loop_count:
      parseBatchRowCount(batchRows) > 1 ||
      rule.background_loop_count === '' ||
      rule.background_loop_count == null
        ? null
        : Number(rule.background_loop_count),
  };
}

function displayMediaLabel(name, id) {
  const value = (name || '').trim();
  if (value) return value;
  return id ? 'Selected' : 'Default';
}

function displayLoops(rule) {
  if (parseBatchRowCount(rule.batch_rows) > 1) {
    return 'Auto';
  }
  if (!rule.background_loop_count) {
    return 'Auto';
  }
  return rule.background_loop_count;
}

export default function RowRulesTable({ embedded = false, query: queryProp }) {
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();
  const [rules, setRules] = useState([]);
  const [draftRule, setDraftRule] = useState(emptyRule());
  const [editingIndex, setEditingIndex] = useState(null);
  const [backgrounds, setBackgrounds] = useState([]);
  const [thumbnails, setThumbnails] = useState([]);
  const [saving, setSaving] = useState(false);
  const [refreshingDrive, setRefreshingDrive] = useState(false);

  const query = queryProp ?? {
    data: null,
    error: '',
    loading: false,
    refreshing: false,
    isInitialLoad: true,
    refresh: () => {},
  };

  const loading = Boolean(query.isInitialLoad);
  const refreshing = query.refreshing;
  const formDisabled = loading || refreshing || refreshingDrive || saving;
  const repeatAnchors = new Set(query.data?.rulesData?.repeat_anchors ?? []);
  const draftBatchCount = parseBatchRowCount(draftRule.batch_rows);
  const draftIsMultiBatch = draftBatchCount > 1;
  const draftAnchorRow = ruleAnchorRow(draftRule.batch_rows);
  const draftIsRepeatAnchor = repeatAnchors.has(draftAnchorRow);

  useEffect(() => {
    const bundle = query.data;
    if (!bundle) return;
    setRules(mapRulesFromApi(bundle.rulesData));
    setBackgrounds(bundle.media?.background_videos ?? []);
    setThumbnails(bundle.media?.thumbnail_images ?? []);
  }, [query.data]);

  const resetDraft = () => {
    setDraftRule(emptyRule());
    setEditingIndex(null);
  };

  const refreshDriveLists = async () => {
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
      showError(e.message);
    } finally {
      setRefreshingDrive(false);
    }
  };

  const persistRules = async (nextRules, successMessage = 'Row rules saved.') => {
    setSaving(true);
    try {
      const payload = nextRules.map((rule) =>
        ruleToPayload(rule, backgrounds, thumbnails, repeatAnchors),
      );
      const result = await saveRowRules(payload);
      const autoDoCount = result.auto_do_rows?.length ?? 0;
      showSuccess(
        autoDoCount
          ? `${successMessage} ${autoDoCount} row(s) set to do.`
          : successMessage,
      );
      invalidateCache(SETTINGS_ROW_RULES_CACHE_KEY);
      await query.refresh();
    } catch (e) {
      showError(e.message);
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRule = async () => {
    const batchRows = String(draftRule.batch_rows ?? '').trim();
    if (!batchRows) {
      showError('Enter at least one sheet row in Select Rows.');
      return;
    }
    if (draftIsRepeatAnchor) {
      showError(
        `Row #${draftAnchorRow} is a repeat job. Set background, loop, and thumbnails in Jobs → Schedule → Repeat.`,
      );
      return;
    }

    const nextRules =
      editingIndex == null
        ? [...rules, { ...draftRule, batch_rows: batchRows }]
        : rules.map((rule, index) =>
            index === editingIndex ? { ...draftRule, batch_rows: batchRows } : rule,
          );

    try {
      await persistRules(
        nextRules,
        editingIndex == null ? 'Rule saved.' : 'Rule updated.',
      );
      setRules(nextRules);
      resetDraft();
    } catch {
      // error already set
    }
  };

  const handleEditRule = (index) => {
    setDraftRule({ ...rules[index] });
    setEditingIndex(index);
  };

  const handleDeleteRule = async (index) => {
    const rule = rules[index];
    const ok = await confirm({
      title: 'Delete row rule?',
      message: `Remove the rule for rows "${rule?.batch_rows || ''}"? This cannot be undone.`,
      confirmLabel: 'Delete rule',
      cancelLabel: 'Keep rule',
      variant: 'danger',
    });
    if (!ok) {
      return;
    }

    const nextRules = rules.filter((_, i) => i !== index);
    try {
      await persistRules(nextRules, 'Rule deleted.');
      setRules(nextRules);
      if (editingIndex === index) {
        resetDraft();
      } else if (editingIndex != null && editingIndex > index) {
        setEditingIndex(editingIndex - 1);
      }
    } catch {
      // error already set
    }
  };

  const showContent = !loading;

  return (
    <div className={`row-rules-page${embedded ? ' row-rules-page--embedded' : ''}`}>
      <SettingsTabStatus loading={loading} refreshing={refreshing} label="row rules" />

      <LoadingOverlay
        loading={loading}
        label="Loading row rules…"
        className={`row-rules-loading${refreshing ? ' is-refreshing' : ''}`}
      >
        {showContent ? (
          <>
            <section className="row-rules-form-card card">
              <h3 className="row-rules-section-title">
                {editingIndex == null ? 'Add New Row Rule' : 'Edit Row Rule'}
              </h3>

              <div className="row-rules-form-stack">
                <div className="form-group">
                  <label className="form-label" htmlFor="row-rules-draft-rows">
                    Select Rows
                  </label>
                  <input
                    id="row-rules-draft-rows"
                    className="form-input row-rules-rows"
                    type="text"
                    placeholder="4409 or 70, 601, 805"
                    value={draftRule.batch_rows}
                    disabled={formDisabled}
                    onChange={(e) =>
                      setDraftRule((prev) => ({
                        ...prev,
                        batch_rows: e.target.value.replace(/[^\d,\s]/g, ''),
                      }))
                    }
                  />
                  {draftIsRepeatAnchor && (
                    <p className="settings-gemini-hint row-rules-repeat-hint">
                      Row #{draftAnchorRow} is a repeat job. Use Jobs → Schedule → Repeat for
                      background, loops, and thumbnails.
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="row-rules-draft-bg">
                    Background
                  </label>
                  <MediaSelectDropdown
                    id="row-rules-draft-bg"
                    value={draftIsRepeatAnchor ? '' : draftRule.background_video_id}
                    options={backgrounds}
                    disabled={formDisabled || draftIsRepeatAnchor}
                    searchPlaceholder="Search backgrounds…"
                    title={
                      draftIsRepeatAnchor
                        ? 'Repeat row — set background in Jobs → Schedule → Repeat'
                        : undefined
                    }
                    onChange={(id, opt) => {
                      setDraftRule((prev) => ({
                        ...prev,
                        background_video_id: id,
                        background_video_name: opt?.name ?? '',
                      }));
                    }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="row-rules-draft-thumb">
                    Thumbnail
                  </label>
                  <MediaSelectDropdown
                    id="row-rules-draft-thumb"
                    value={draftIsRepeatAnchor ? '' : draftRule.thumbnail_file_id}
                    options={thumbnails}
                    disabled={formDisabled || draftIsRepeatAnchor}
                    searchPlaceholder="Search thumbnails…"
                    title={
                      draftIsRepeatAnchor
                        ? 'Repeat row — set thumbnails in Jobs → Schedule → Repeat'
                        : undefined
                    }
                    onChange={(id, opt) => {
                      setDraftRule((prev) => ({
                        ...prev,
                        thumbnail_file_id: id,
                        thumbnail_name: opt?.name ?? '',
                      }));
                    }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="row-rules-draft-loops">
                    Loops
                  </label>
                  <div className="row-rules-loops-row">
                    <input
                      id="row-rules-draft-loops"
                      className="form-input row-rules-num"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Auto"
                      value={draftIsMultiBatch || draftIsRepeatAnchor ? '' : draftRule.background_loop_count}
                      disabled={formDisabled || draftIsMultiBatch || draftIsRepeatAnchor}
                      onChange={(e) =>
                        setDraftRule((prev) => ({
                          ...prev,
                          background_loop_count: e.target.value.replace(/\D/g, ''),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm row-rules-refresh-btn"
                      onClick={refreshDriveLists}
                      disabled={loading || refreshingDrive}
                    >
                      <RefreshCw
                        size={14}
                        className={refreshingDrive ? 'content-calendar-spin' : ''}
                      />
                      Refresh Drive Lists
                    </button>
                  </div>
                </div>

                <div className="row-rules-form-actions">
                  {editingIndex != null && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={resetDraft}
                      disabled={formDisabled}
                    >
                      Cancel edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary row-rules-save-btn"
                    onClick={handleSaveRule}
                    disabled={formDisabled || draftIsRepeatAnchor}
                  >
                    <Save size={14} />
                    {saving ? 'Saving…' : editingIndex == null ? 'Save Rule' : 'Update Rule'}
                  </button>
                </div>
              </div>
            </section>

            <section className="row-rules-saved-card card">
              <h3 className="row-rules-section-title">Saved Rules</h3>

              {rules.length === 0 ? (
                <p className="row-rules-empty">No saved rules yet.</p>
              ) : (
                <div className="row-rules-saved-wrap">
                  <table className="row-rules-saved-table">
                    <thead>
                      <tr>
                        <th scope="col" className="row-rules-col-index">
                          #
                        </th>
                        <th scope="col" className="row-rules-col-rows">
                          Rows
                        </th>
                        <th scope="col" className="row-rules-col-media">
                          Background
                        </th>
                        <th scope="col" className="row-rules-col-media">
                          Thumbnail
                        </th>
                        <th scope="col" className="row-rules-col-loops">
                          Loops
                        </th>
                        <th scope="col" className="row-rules-col-actions">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((rule, index) => (
                        <tr
                          key={`${rule.batch_rows}-${index}`}
                          className={editingIndex === index ? 'is-editing' : ''}
                        >
                          <td className="row-rules-index" data-label="#">{index + 1}</td>
                          <td className="row-rules-cell-rows" data-label="Rows">{rule.batch_rows}</td>
                          <td className="row-rules-cell-media" data-label="Background">
                            {displayMediaLabel(
                              rule.background_video_name,
                              rule.background_video_id,
                            )}
                          </td>
                          <td className="row-rules-cell-media" data-label="Thumbnail">
                            {displayMediaLabel(rule.thumbnail_name, rule.thumbnail_file_id)}
                          </td>
                          <td className="row-rules-cell-loops" data-label="Loops">{displayLoops(rule)}</td>
                          <td className="row-rules-cell-actions" data-label="Actions">
                            <div className="row-rules-saved-actions">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm job-action-btn"
                                onClick={() => handleEditRule(index)}
                                disabled={formDisabled}
                                aria-label={`Edit rule ${index + 1}`}
                                title="Edit"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm job-action-btn row-rules-delete"
                                onClick={() => handleDeleteRule(index)}
                                disabled={formDisabled}
                                aria-label={`Delete rule ${index + 1}`}
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="settings-panel-placeholder" aria-hidden="true" />
        )}
      </LoadingOverlay>
    </div>
  );
}
