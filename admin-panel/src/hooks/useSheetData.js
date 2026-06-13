import { useCallback, useEffect, useRef } from 'react';
import {
  fetchJobMonks,
  fetchJobsPage,
  fetchLogs,
  fetchRenderStatus,
  fetchStats,
} from '../data/api';
import { fetchCalendarEvents } from '../data/jobsApi';
import {
  calendarCacheKey,
  jobsPageCacheKey,
  JOBS_MONKS_CACHE_KEY,
  LOGS_CACHE_KEY,
  RENDER_STATUS_CACHE_KEY,
} from '../data/jobsCacheKeys';
import { JOBS_TOOLBAR_FILTERS } from '../data/jobsSheet';
import { prefetchCache } from '../data/queryCache';
import { ensureJobPlayerPrefsLoaded } from '../data/jobPlayerPrefs';
import { useCachedQuery } from './useCachedQuery';

const STATS_TTL = 8000;
const JOBS_PAGE_TTL = 45000;
const JOBS_MONKS_TTL = 45000;
const CALENDAR_TTL = 45000;
const RENDER_TTL = 3000;
export const LOGS_TTL = 5000;
const DEFAULT_PAGE_SIZE = 50;

export function useCachedStats(options = {}) {
  const pollMs = options.pollMs ?? STATS_TTL;
  const enabled = options.enabled ?? true;
  return useCachedQuery('stats', fetchStats, {
    ttlMs: STATS_TTL,
    pollMs: enabled ? pollMs : 0,
    enabled,
  });
}

export function useJobsPage({
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  status = 'all',
  search = '',
  monk = '',
  row = null,
} = {}, options = {}) {
  const pollMs = options.pollMs ?? 0;
  const enabled = options.enabled ?? true;
  const cacheKey = jobsPageCacheKey({ page, pageSize, status, search, monk, row });
  const fetcher = useCallback(
    (force) =>
      fetchJobsPage({
        page,
        pageSize,
        status,
        search,
        monk,
        row,
        refresh: Boolean(force),
      }),
    [page, pageSize, status, search, monk, row],
  );
  const query = useCachedQuery(cacheKey, fetcher, {
    ttlMs: JOBS_PAGE_TTL,
    pollMs,
    enabled,
  });

  return {
    ...query,
    isInitialLoad: enabled && query.loading && query.data == null,
  };
}

export function useJobMonks(options = {}) {
  const pollMs = options.pollMs ?? 0;
  const enabled = options.enabled ?? true;
  const fetcher = useCallback(
    (force) => fetchJobMonks({ refresh: Boolean(force) }),
    [],
  );
  const query = useCachedQuery(JOBS_MONKS_CACHE_KEY, fetcher, {
    ttlMs: JOBS_MONKS_TTL,
    pollMs,
    enabled,
  });

  return {
    ...query,
    isInitialLoad: enabled && query.loading && query.data == null,
  };
}

export function useCalendarEvents(year, month, options = {}) {
  const pollMs = options.pollMs ?? 0;
  const enabled = options.enabled ?? true;
  const cacheKey = calendarCacheKey(year, month);
  const fetcher = useCallback(
    (force) => fetchCalendarEvents(year, month, { refresh: Boolean(force) }),
    [year, month],
  );
  const query = useCachedQuery(cacheKey, fetcher, {
    ttlMs: CALENDAR_TTL,
    pollMs: enabled ? pollMs : 0,
    enabled,
  });
  return {
    ...query,
    isInitialLoad: enabled && query.isInitialLoad,
  };
}

export function useCachedLogs(options = {}) {
  const enabled = options.enabled ?? true;
  const fetcher = useCallback(() => fetchLogs(150), []);
  const query = useCachedQuery(LOGS_CACHE_KEY, fetcher, {
    ttlMs: LOGS_TTL,
    pollMs: enabled ? LOGS_TTL : 0,
    enabled,
  });
  return query;
}

/** Prefetch previous and next month for snappy calendar navigation. */
export function prefetchAdjacentCalendarMonths(year, month) {
  const current = new Date(year, month - 1, 1);
  const prev = new Date(current);
  prev.setMonth(prev.getMonth() - 1);
  const next = new Date(current);
  next.setMonth(next.getMonth() + 1);

  const prefetchMonth = (y, m) =>
    prefetchCache(
      calendarCacheKey(y, m),
      () => fetchCalendarEvents(y, m),
      CALENDAR_TTL,
    );

  return Promise.all([
    prefetchMonth(prev.getFullYear(), prev.getMonth() + 1),
    prefetchMonth(next.getFullYear(), next.getMonth() + 1),
  ]);
}

/** Prefetch one filter tab (hover/focus) or the active tab only. */
export function prefetchJobsFilterTab({
  pageSize = DEFAULT_PAGE_SIZE,
  search = '',
  monk = '',
  status = 'all',
  row = null,
} = {}) {
  const key = jobsPageCacheKey({
    page: 1,
    pageSize,
    status,
    search,
    monk,
    row,
  });
  return prefetchCache(
    key,
    () =>
      fetchJobsPage({
        page: 1,
        pageSize,
        status,
        search,
        monk,
        row,
      }),
    JOBS_PAGE_TTL,
  );
}

/** @deprecated Prefer prefetchJobsFilterTab for a single tab. */
export function prefetchJobsFilterTabs({
  pageSize = DEFAULT_PAGE_SIZE,
  search = '',
  monk = '',
  status,
} = {}) {
  if (status != null) {
    return prefetchJobsFilterTab({ pageSize, search, monk, status });
  }
  const targets = JOBS_TOOLBAR_FILTERS;
  return Promise.all(
    targets.map(([filterStatus]) =>
      prefetchJobsFilterTab({
        pageSize,
        search,
        monk,
        status: filterStatus,
      }),
    ),
  );
}

/** Prefetch adjacent pages silently after the current page is shown. */
export function prefetchAdjacentJobsPages({
  page,
  totalPages,
  pageSize = DEFAULT_PAGE_SIZE,
  status = 'all',
  search = '',
  monk = '',
  row = null,
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
        row,
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
            row,
          }),
        JOBS_PAGE_TTL,
      );
    }),
  );
}

/** Warm common caches after login or on Dashboard mount. */
export async function warmAppCache({ jobs = true } = {}) {
  const now = new Date();
  const tasks = [
    prefetchCache('stats', fetchStats, STATS_TTL),
    prefetchCache(RENDER_STATUS_CACHE_KEY, fetchRenderStatus, RENDER_TTL),
    prefetchCache(
      calendarCacheKey(now.getFullYear(), now.getMonth() + 1),
      () => fetchCalendarEvents(now.getFullYear(), now.getMonth() + 1),
      CALENDAR_TTL,
    ),
    prefetchAdjacentCalendarMonths(now.getFullYear(), now.getMonth() + 1),
    ensureJobPlayerPrefsLoaded(),
  ];
  if (jobs) {
    tasks.push(warmJobsCache());
  }
  await Promise.all(tasks);
}

/** Warm Jobs page 1 + page 2 from Dashboard after login. */
export async function warmJobsCache({
  pageSize = DEFAULT_PAGE_SIZE,
  search = '',
  monk = '',
} = {}) {
  await Promise.all([
    prefetchJobsFilterTab({ pageSize, search, monk, status: 'all' }),
    prefetchAdjacentJobsPages({
      page: 1,
      totalPages: 2,
      pageSize,
      status: 'all',
      search,
      monk,
    }),
  ]);
}

/** Polls every 2s while a render is active, otherwise uses cache only. */
export function useCachedRenderStatus(options = {}) {
  const enabled = options.enabled ?? true;
  const query = useCachedQuery(RENDER_STATUS_CACHE_KEY, fetchRenderStatus, {
    ttlMs: RENDER_TTL,
    pollMs: 0,
    enabled,
  });

  const refreshRef = useRef(query.refresh);
  refreshRef.current = query.refresh;

  useEffect(() => {
    if (!enabled || !query.data?.running) return undefined;
    const id = setInterval(() => refreshRef.current(), 2000);
    return () => clearInterval(id);
  }, [enabled, query.data?.running]);

  return query;
}
