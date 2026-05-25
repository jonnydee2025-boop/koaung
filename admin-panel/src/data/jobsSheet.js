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
  'failed',
];

export const STATUS_FILTER_LABELS = {
  all: 'All',
  done: 'Done',
  processing: 'Processing',
  pending: 'Pending',
  do: 'Priority',
  scheduled: 'Scheduled',
  failed: 'Failed',
};

export const STATUS_FILTERS = JOB_STATUS_FILTER_KEYS.map((key) => [
  key,
  STATUS_FILTER_LABELS[key],
]);

/** Jobs toolbar tabs — pending is tracked in API counts but hidden from the tab bar. */
export const JOBS_TOOLBAR_FILTERS = STATUS_FILTERS.filter(([key]) => key !== 'pending');

export const EMPTY_COUNTS = Object.fromEntries(
  JOB_STATUS_FILTER_KEYS.map((key) => [key, 0]),
);
