import { fetchLogs } from '../data/api';
import { LOGS_CACHE_KEY } from '../data/jobsCacheKeys';
import { prefetchCache } from '../data/queryCache';
import { LOGS_TTL, warmAppCache, warmJobsCache } from './useSheetData';

const routeChunks = {
  '/': () => import('../pages/Dashboard'),
  '/jobs': () => import('../pages/Jobs'),
  '/logs': () => import('../pages/Logs'),
  '/settings': () => import('../pages/Settings'),
};

/** Preload route JS chunk (React.lazy bundle). */
export function prefetchRouteChunk(path) {
  const loader = routeChunks[path];
  if (loader) {
    loader().catch(() => {});
  }
}

/** Warm API cache for a route before navigation. */
export function prefetchRouteData(path) {
  prefetchRouteChunk(path);

  if (path === '/') {
    warmAppCache().catch(() => {});
    return;
  }
  if (path === '/jobs') {
    warmJobsCache().catch(() => {});
    return;
  }
  if (path === '/logs') {
    prefetchCache(LOGS_CACHE_KEY, () => fetchLogs(150), LOGS_TTL).catch(() => {});
  }
}
