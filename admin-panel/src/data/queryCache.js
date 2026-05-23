/**
 * In-memory TTL cache for admin API responses (shared across Dashboard / Jobs).
 */

const store = new Map();

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
  invalidateCache('jobs:*'); /* jobs:all, jobs:6, … */
}
