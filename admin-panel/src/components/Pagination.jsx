export default function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  disabled = false,
}) {
  if (totalPages <= 1 && total <= pageSize) {
    return (
      <div className="pagination-bar">
        <span className="pagination-meta">
          {total === 0 ? 'No rows' : `Showing all ${total} row${total === 1 ? '' : 's'}`}
        </span>
      </div>
    );
  }

  const pages = buildPageList(page, totalPages);

  return (
    <div className="pagination-bar">
      <span className="pagination-meta">
        Page {page} of {totalPages} · {total.toLocaleString()} row{total === 1 ? '' : 's'}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        {pages.map((p, index) =>
          p === '…' ? (
            <span key={`ellipsis-${index}`} className="pagination-ellipsis">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`btn btn-ghost btn-sm pagination-page${p === page ? ' active' : ''}`}
              disabled={disabled}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function buildPageList(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const p = sorted[i];
    const prev = sorted[i - 1];
    if (i > 0 && p - prev > 1) {
      result.push('…');
    }
    result.push(p);
  }

  return result;
}
