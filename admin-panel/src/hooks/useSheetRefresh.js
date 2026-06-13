import { useCallback } from 'react';
import { invalidateSheetCaches } from '../data/queryCache';

/** Invalidate all sheet caches and notify subscribed hooks (no full page reload). */
export function useSheetRefresh() {
  return useCallback(() => {
    invalidateSheetCaches();
  }, []);
}
