import { useCallback, useEffect, useRef } from 'react';
import {
  fetchAllJobs,
  fetchStats,
  fetchJobs,
  fetchRenderStatus,
} from '../data/api';
import { useCachedQuery } from './useCachedQuery';

const STATS_TTL = 8000;
const JOBS_TTL = 10000;
const JOBS_SHEET_TTL = 45000;
const RENDER_TTL = 3000;

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

/** Jobs tab: one in-memory fetch of the full sheet; survives route unmount. */
export function useJobsSheet(options = {}) {
  const pollMs = options.pollMs ?? 15000;
  const ttlMs = options.ttlMs ?? JOBS_SHEET_TTL;
  const enabled = options.enabled ?? true;
  const fetcher = useCallback(
    (force) => fetchAllJobs({ refresh: Boolean(force) }),
    [],
  );
  return useCachedQuery('jobs:all', fetcher, {
    ttlMs,
    pollMs,
    enabled,
  });
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
