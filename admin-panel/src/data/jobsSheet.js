/**
 * Shared Jobs tab constants (filter labels and empty counts).
 */

export const JOB_STATUS_FILTER_KEYS = [
  'all',
  'done',
  'processing',
  'pending',
  'do',
  'scheduled',
  'repeat',
  'failed',
];

export const STATUS_FILTER_LABELS = {
  all: 'All',
  done: 'Done',
  processing: 'Processing',
  pending: 'Pending',
  do: 'Priority',
  scheduled: 'Scheduled',
  repeat: 'Repeat',
  failed: 'Failed',
};

/** Jobs toolbar tabs — pending is tracked in API counts but hidden from the tab bar. */
export const JOBS_TOOLBAR_FILTERS = JOB_STATUS_FILTER_KEYS.filter((key) => key !== 'pending').map(
  (key) => [key, STATUS_FILTER_LABELS[key]],
);

export const EMPTY_COUNTS = Object.fromEntries(
  JOB_STATUS_FILTER_KEYS.map((key) => [key, 0]),
);
