import { useCallback, useEffect, useRef } from 'react';
import {
  fetchJobMonks,
  fetchJobsPage,
  fetchRenderStatus,
  fetchStats,
  fetchJobs,
} from '../data/api';
import { jobsPageCacheKey, JOBS_MONKS_CACHE_KEY } from '../data/jobsCacheKeys';
import { prefetchCache } from '../data/queryCache';
import { useCachedQuery } from './useCachedQuery';

const STATS_TTL = 8000;
const JOBS_TTL = 10000;
const JOBS_PAGE_TTL = 45000;
const JOBS_MONKS_TTL = 45000;
const RENDER_TTL = 3000;
const DEFAULT_PAGE_SIZE = 50;

export function useCachedStats(options = {}) {
  const pollMs = options.pollMs ?? STATS_TTL;
  const enabled = options.enabled ?? true;
  return useCachedQuery('stats', fetchStats, {
    ttlMs: STATS_TTL,
    pollMs,
    enabled,
  });
}

export function useCachedJobs(limit, options = {}) {
  const key = `jobs:${limit}`;
  const pollMs = options.pollMs ?? 0;
  const enabled = options.enabled ?? true;
  const fetcher = useCallback(() => fetchJobs(limit), [limit]);
  return useCachedQuery(key, fetcher, {
    ttlMs: JOBS_TTL,
    pollMs,
    enabled,
  });
}

export function useJobsPage({
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  status = 'all',
  search = '',
  monk = '',
} = {}, options = {}) {
  const pollMs = options.pollMs ?? 0;
  const enabled = options.enabled ?? true;
  const cacheKey = jobsPageCacheKey({ page, pageSize, status, search, monk });
  const fetcher = useCallback(
    (force) =>
      fetchJobsPage({
        page,
        pageSize,
        status,
        search,
        monk,
        refresh: Boolean(force),
      }),
    [page, pageSize, status, search, monk],
  );
  return useCachedQuery(cacheKey, fetcher, {
    ttlMs: JOBS_PAGE_TTL,
    pollMs,
    enabled,
  });
}

export function useJobMonks(options = {}) {
  const pollMs = options.pollMs ?? 0;
  const enabled = options.enabled ?? true;
  const fetcher = useCallback(
    (force) => fetchJobMonks({ refresh: Boolean(force) }),
    [],
  );
  return useCachedQuery(JOBS_MONKS_CACHE_KEY, fetcher, {
    ttlMs: JOBS_MONKS_TTL,
    pollMs,
    enabled,
  });
}

/** Prefetch adjacent pages silently after the current page is shown. */
export function prefetchAdjacentJobsPages({
  page,
  totalPages,
  pageSize = DEFAULT_PAGE_SIZE,
  status = 'all',
  search = '',
  monk = '',
} = {}) {
  const targets = [page + 1, page + 2].filter(
    (nextPage) => nextPage >= 1 && nextPage <= totalPages,
  );

  return Promise.all(
    targets.map((nextPage) => {
      const key = jobsPageCacheKey({
        page: nextPage,
        pageSize,
        status,
        search,
        monk,
      });
      return prefetchCache(
        key,
        () =>
          fetchJobsPage({
            page: nextPage,
            pageSize,
            status,
            search,
            monk,
          }),
        JOBS_PAGE_TTL,
      );
    }),
  );
}

/** Warm Jobs page 1 + pages 2–3 from Dashboard after login. */
export async function warmJobsCache({
  pageSize = DEFAULT_PAGE_SIZE,
  status = 'all',
  search = '',
  monk = '',
} = {}) {
  const page1Key = jobsPageCacheKey({ page: 1, pageSize, status, search, monk });
  await prefetchCache(
    page1Key,
    () => fetchJobsPage({ page: 1, pageSize, status, search, monk }),
    JOBS_PAGE_TTL,
  );
  await prefetchAdjacentJobsPages({
    page: 1,
    totalPages: Number.POSITIVE_INFINITY,
    pageSize,
    status,
    search,
    monk,
  });
  await prefetchCache(
    JOBS_MONKS_CACHE_KEY,
    () => fetchJobMonks(),
    JOBS_MONKS_TTL,
  );
}

/** Polls every 2s while a render is active, otherwise uses cache only. */
export function useCachedRenderStatus() {
  const query = useCachedQuery('render-status', fetchRenderStatus, {
    ttlMs: RENDER_TTL,
    pollMs: 0,
  });

  const refreshRef = useRef(query.refresh);
  refreshRef.current = query.refresh;

  useEffect(() => {
    if (!query.data?.running) return undefined;
    const id = setInterval(() => refreshRef.current(), 2000);
    return () => clearInterval(id);
  }, [query.data?.running]);

  return query;
}
