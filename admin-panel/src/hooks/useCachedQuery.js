import { useState, useCallback, useRef, useLayoutEffect } from 'react';
import { readCache, fetchWithCache } from '../data/queryCache';

function snapshotForKey(cacheKey) {
  const cached = readCache(cacheKey);
  return {
    data: cached?.data ?? null,
    loading: cached?.data == null,
    updatedAt: cached?.at ? new Date(cached.at) : null,
  };
}

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

  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  const initial = snapshotForKey(cacheKey);
  const [trackedKey, setTrackedKey] = useState(cacheKey);
  const [data, setData] = useState(initial.data);
  const [loading, setLoading] = useState(enabled && initial.loading);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const mounted = useRef(true);

  // Reset immediately when the cache key changes so we never show another query's data.
  if (trackedKey !== cacheKey) {
    const next = snapshotForKey(cacheKey);
    setTrackedKey(cacheKey);
    setData(next.data);
    setLoading(enabled && next.loading);
    setRefreshing(false);
    setError('');
    setUpdatedAt(next.updatedAt);
  }

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;

      const requestKey = cacheKey;
      const cached = readCache(requestKey);
      const hasData = cached?.data != null;

      if (hasData) {
        if (cacheKeyRef.current === requestKey) {
          setData(cached.data);
          setUpdatedAt(new Date(cached.at));
        }
        if (cached.isFresh && !force) {
          if (cacheKeyRef.current === requestKey) {
            setLoading(false);
            setRefreshing(false);
          }
          return;
        }
        if (cacheKeyRef.current === requestKey) {
          setRefreshing(true);
        }
      } else if (cacheKeyRef.current === requestKey) {
        setLoading(true);
      }

      try {
        const result = await fetchWithCache(
          requestKey,
          (forced) => fetcherRef.current(forced),
          ttlMs,
          { force },
        );
        if (!mounted.current || cacheKeyRef.current !== requestKey) return;
        setData(result);
        setError('');
        setUpdatedAt(new Date());
      } catch (err) {
        if (!mounted.current || cacheKeyRef.current !== requestKey) return;
        if (!hasData) setError(err.message || String(err));
      } finally {
        if (mounted.current && cacheKeyRef.current === requestKey) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [cacheKey, enabled, ttlMs],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useLayoutEffect(() => {
    mounted.current = true;

    if (!enabled) {
      return () => {
        mounted.current = false;
      };
    }

    const cached = readCache(cacheKey);
    if (cached?.data != null) {
      setData(cached.data);
      setUpdatedAt(new Date(cached.at));
      setLoading(false);
    } else {
      setData(null);
      setLoading(true);
    }
    loadRef.current(!cached?.isFresh);

    let intervalId;
    if (pollMs > 0) {
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
    cacheKey,
    data,
    loading,
    refreshing,
    error,
    updatedAt,
    refresh,
    isStale: Boolean(data && cachedNow && !cachedNow.isFresh),
    isInitialLoad: enabled && loading && data == null,
  };
}
