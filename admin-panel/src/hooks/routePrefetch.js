import {
  fetchGeminiModels,
  fetchLogs,
  fetchRowRulesBundle,
  fetchSettings,
} from '../data/api';
import {
  SETTINGS_GEMINI_CACHE_KEY,
  SETTINGS_GENERAL_CACHE_KEY,
  SETTINGS_ROW_RULES_CACHE_KEY,
} from '../data/settingsCacheKeys';
import { LOGS_CACHE_KEY } from '../data/jobsCacheKeys';
import { SETTINGS_SECTIONS } from '../data/settingsSections';
import { prefetchCache } from '../data/queryCache';
import { LOGS_TTL, warmAppCache, warmJobsCache } from './useSheetData';

const SETTINGS_TTL = 60000;

const routeChunks = {
  '/': () => import('../pages/Dashboard'),
  '/jobs': () => import('../pages/Jobs'),
  '/logs': () => import('../pages/Logs'),
  ...Object.fromEntries(
    SETTINGS_SECTIONS.map((section) => [section.path, () => import('../pages/Settings')]),
  ),
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
    return;
  }
  if (path === '/general' || path === '/settings') {
    prefetchCache(SETTINGS_GENERAL_CACHE_KEY, fetchSettings, SETTINGS_TTL).catch(() => {});
    return;
  }
  if (path === '/ai') {
    prefetchCache(SETTINGS_GEMINI_CACHE_KEY, fetchGeminiModels, SETTINGS_TTL).catch(() => {});
    return;
  }
  if (path === '/row-rules') {
    prefetchCache(SETTINGS_ROW_RULES_CACHE_KEY, fetchRowRulesBundle, SETTINGS_TTL).catch(() => {});
  }
}
