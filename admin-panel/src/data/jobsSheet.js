/**
 * Client-side filter/pagination for the Jobs tab (mirrors video_bot/api/job_listing.py).
 */

import { isDoneStatus, isPendingStatus } from './statusTheme';

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

const EMPTY_COUNTS = Object.fromEntries(
  JOB_STATUS_FILTER_KEYS.map((key) => [key, 0]),
);

export function jobMonkName(job) {
  return (job.monk || job.monk_name || '').trim();
}

/** Distinct monk names from cached sheet rows, sorted for dropdown options. */
export function uniqueMonkNames(jobs) {
  const names = new Set();
  for (const job of jobs ?? []) {
    const name = jobMonkName(job);
    if (name) {
      names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function filterJobs(jobs, status, search, monkFilter = '') {
  const query = search.trim().toLowerCase();
  const monk = monkFilter.trim();
  const filtered = [];

  for (const job of jobs) {
    const jobStatus = job.status;
    if (status === 'done' && !isDoneStatus(jobStatus)) continue;
    if (status === 'processing' && jobStatus !== 'processing') continue;
    if (status === 'pending' && !isPendingStatus(jobStatus)) continue;
    if (status === 'do' && jobStatus !== 'do') continue;
    if (status === 'failed' && jobStatus !== 'failed') continue;
    if (status === 'scheduled' && jobStatus !== 'scheduled') continue;

    if (monk && jobMonkName(job) !== monk) continue;

    if (query) {
      const title = (job.title || '').toLowerCase();
      const monkName = jobMonkName(job).toLowerCase();
      if (!title.includes(query) && !monkName.includes(query)) continue;
    }

    filtered.push(job);
  }

  return filtered;
}

export function paginateJobs(jobs, page, pageSize) {
  const total = jobs.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  let currentPage = page;

  if (total === 0) {
    currentPage = 1;
  } else if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  if (currentPage < 1) {
    currentPage = 1;
  }

  const start = (currentPage - 1) * pageSize;
  const items = jobs.slice(start, start + pageSize);

  return {
    items,
    page: currentPage,
    page_size: pageSize,
    total,
    total_pages: totalPages,
  };
}

export function buildJobsPageView(
  allJobs,
  counts,
  { page, pageSize, status, search, monkFilter = '' },
) {
  const filtered = filterJobs(allJobs ?? [], status, search, monkFilter);
  const slice = paginateJobs(filtered, page, pageSize);
  return {
    ...slice,
    counts: counts ?? EMPTY_COUNTS,
    sheet_total: allJobs?.length ?? 0,
  };
}

export { EMPTY_COUNTS };
