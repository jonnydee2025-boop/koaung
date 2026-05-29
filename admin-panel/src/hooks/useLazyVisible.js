import { useEffect, useRef, useState } from 'react';

/**
 * Defer work until `ref` enters the viewport (plus rootMargin).
 * Once visible, stays true for the component lifetime.
 */
export function useLazyVisible(options = {}) {
  const { rootMargin = '120px', initialVisible = false } = options;
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(initialVisible);

  useEffect(() => {
    if (isVisible) return undefined;

    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  return { ref, isVisible };
}
