export default function CacheHint({
  refreshing = false,
  updatedAt = null,
  sheetTotal = null,
  isStale = false,
  mode = 'time',
}) {
  if (mode === 'time' && !updatedAt) {
    return null;
  }
  if (mode === 'sheet' && !updatedAt && sheetTotal == null) {
    return null;
  }

  if (mode === 'time') {
    return (
      <span className="cache-hint" title="Data may be served from cache while refreshing">
        {refreshing ? 'Updating…' : `Cached · ${updatedAt.toLocaleTimeString()}`}
      </span>
    );
  }

  const status = refreshing
    ? 'Updating…'
    : isStale
      ? 'Stale · refreshing…'
      : 'Cached · in memory';
  const time = updatedAt?.toLocaleTimeString() ?? '—';
  const rows = sheetTotal != null ? `${sheetTotal.toLocaleString()} rows in sheet` : null;

  return (
    <span className="cache-hint">
      {[status, time, rows].filter(Boolean).join(' · ')}
    </span>
  );
}
