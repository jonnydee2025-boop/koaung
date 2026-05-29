/**
 * In-memory TTL cache for admin API responses (shared across Dashboard / Jobs).
 */

const store = new Map();
const inflight = new Map();

export function readCache(key) {
  const entry = store.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.at;
  return {
    data: entry.data,
    at: entry.at,
    age,
    ttl: entry.ttl,
    isFresh: age < entry.ttl,
  };
}

export function writeCache(key, data, ttlMs) {
  store.set(key, { data, at: Date.now(), ttl: ttlMs });
}

export function invalidateCache(keyOrPattern) {
  if (keyOrPattern.endsWith('*')) {
    const prefix = keyOrPattern.slice(0, -1);
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
    return;
  }
  store.delete(keyOrPattern);
}

/** Clear sheet-derived data after renders, job actions, or manual refresh. */
export function invalidateSheetCaches() {
  invalidateCache('stats');
  invalidateCache('jobs:*');
  invalidateCache('calendar:*');
  invalidateCache('settings:*');
  invalidateCache('logs:*');
  invalidateCache('render-status');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sheet-cache-invalidated'));
  }
}

/**
 * Fetch with TTL cache and in-flight deduplication (parallel callers share one request).
 */
export async function fetchWithCache(key, fetcher, ttlMs, { force = false } = {}) {
  if (!force) {
    const cached = readCache(key);
    if (cached?.isFresh) {
      return cached.data;
    }
  }

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = Promise.resolve()
    .then(() => fetcher(force))
    .then((data) => {
      writeCache(key, data, ttlMs);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** Silent background fetch — writes to cache without React state updates. */
export async function prefetchCache(key, fetcher, ttlMs) {
  return fetchWithCache(key, fetcher, ttlMs, { force: false });
}
