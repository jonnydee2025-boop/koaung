const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'do', label: 'Do Next' },
  { value: 'failed', label: 'Failed' },
  { value: 'done', label: 'Done' },
];

function isDoneStatus(status) {
  return status === 'uploaded_to_yt' || status === 'done';
}

function selectValue(status) {
  if (isDoneStatus(status)) {
    return 'done';
  }
  if (STATUS_OPTIONS.some((option) => option.value === status)) {
    return status;
  }
  return '';
}

export default function JobStatusSelect({
  status,
  disabled = false,
  saving = false,
  onChange,
}) {
  const isProcessing = status === 'processing';
  const isScheduled = status === 'scheduled';
  const value = selectValue(status);
  const isLocked = isProcessing || disabled || saving;

  return (
    <select
      className="form-input job-status-select"
      value={value}
      disabled={isLocked}
      aria-label="Change status"
      onChange={(e) => {
        const next = e.target.value;
        if (next && next !== value) {
          onChange?.(next);
        }
      }}
    >
      {isScheduled && (
        <option value="" disabled>
          Scheduled
        </option>
      )}
      {isProcessing && (
        <option value="" disabled>
          Rendering
        </option>
      )}
      {STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
