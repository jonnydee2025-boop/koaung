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
