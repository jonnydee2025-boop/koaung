/** Cache keys for paginated Jobs API responses. */

export function jobsPageCacheKey({
  page = 1,
  pageSize = 50,
  status = 'all',
  search = '',
  monk = '',
} = {}) {
  return `jobs:page:${page}:${pageSize}:${status}:${search}:${monk}`;
}

export const JOBS_MONKS_CACHE_KEY = 'jobs:monks';

export function calendarCacheKey(year, month) {
  return `calendar:${year}:${month}`;
}

export const LOGS_CACHE_KEY = 'logs:recent:150';
export const RENDER_STATUS_CACHE_KEY = 'render-status';
