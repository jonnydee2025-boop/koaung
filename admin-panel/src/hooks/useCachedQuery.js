import { useState, useEffect, useCallback, useRef } from 'react';
import { readCache, writeCache } from '../data/queryCache';

/**
 * Stale-while-revalidate hook: show cached data immediately, refresh in background.
 */
export function useCachedQuery(cacheKey, fetcher, options = {}) {
  const {
    ttlMs = 8000,
    pollMs = 0,
    enabled = true,
  } = options;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const initial = readCache(cacheKey);
  const [data, setData] = useState(() => initial?.data ?? null);
  const [loading, setLoading] = useState(enabled && initial?.data == null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(
    initial?.at ? new Date(initial.at) : null,
  );
  const mounted = useRef(true);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;

      const cached = readCache(cacheKey);
      const hasData = cached?.data != null;

      if (hasData) {
        setData(cached.data);
        if (cached.isFresh && !force) {
          setLoading(false);
          setRefreshing(false);
          setUpdatedAt(new Date(cached.at));
          return;
        }
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await fetcherRef.current();
        if (!mounted.current) return;
        writeCache(cacheKey, result, ttlMs);
        setData(result);
        setError('');
        setUpdatedAt(new Date());
      } catch (err) {
        if (!mounted.current) return;
        if (!hasData) setError(err.message || String(err));
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [cacheKey, enabled, ttlMs],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    mounted.current = true;
    const cached = readCache(cacheKey);
    if (cached?.data != null) {
      setData(cached.data);
      setUpdatedAt(new Date(cached.at));
    }
    loadRef.current(!cached?.isFresh);

    let intervalId;
    if (pollMs > 0 && enabled) {
      intervalId = setInterval(() => loadRef.current(false), pollMs);
    }

    return () => {
      mounted.current = false;
      clearInterval(intervalId);
    };
  }, [cacheKey, pollMs, enabled]);

  const refresh = useCallback(() => load(true), [load]);

  const cachedNow = readCache(cacheKey);

  return {
    data,
    loading,
    refreshing,
    error,
    updatedAt,
    refresh,
    isStale: Boolean(data && cachedNow && !cachedNow.isFresh),
  };
}
