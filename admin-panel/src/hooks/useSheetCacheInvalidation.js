import { useEffect, useRef } from 'react';

/** Re-run callbacks when sheet-backed caches are invalidated globally. */
export function useSheetCacheInvalidation(...callbacks) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    const handleInvalidate = () => {
      for (const callback of callbacksRef.current) {
        callback?.();
      }
    };
    window.addEventListener('sheet-cache-invalidated', handleInvalidate);
    return () => window.removeEventListener('sheet-cache-invalidated', handleInvalidate);
  }, []);
}
