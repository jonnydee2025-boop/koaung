export const EDITABLE_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', badgeClass: 'badge-yellow' },
  { value: 'do', label: 'Do Next', badgeClass: 'badge-blue' },
  { value: 'failed', label: 'Failed', badgeClass: 'badge-red' },
  { value: 'done', label: 'Done', badgeClass: 'badge-green' },
];

export const STATUS_THEME = {
  pending: { label: 'Pending', badgeClass: 'badge-yellow' },
  do: { label: 'Do Next', badgeClass: 'badge-blue' },
  failed: { label: 'Failed', badgeClass: 'badge-red' },
  done: { label: 'Done', badgeClass: 'badge-green' },
  uploaded_to_yt: { label: 'Done', badgeClass: 'badge-green' },
  processing: { label: 'Rendering', badgeClass: 'badge-accent' },
  scheduled: { label: 'Scheduled', badgeClass: 'badge-blue' },
};

export function isDoneStatus(status) {
  return status === 'uploaded_to_yt' || status === 'done';
}

export function selectStatusValue(status) {
  if (isDoneStatus(status)) {
    return 'done';
  }
  if (EDITABLE_STATUS_OPTIONS.some((option) => option.value === status)) {
    return status;
  }
  return '';
}

export function statusThemeFor(status) {
  return STATUS_THEME[status] || { label: status || 'Unknown', badgeClass: 'badge-muted' };
}
