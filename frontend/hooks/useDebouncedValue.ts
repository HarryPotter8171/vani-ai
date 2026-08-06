'use client';

import { useEffect, useState } from 'react';

/**
 * Returns a value that only updates after `delayMs` has elapsed without
 * `value` changing again. Used to throttle expensive/network-bound work
 * (e.g. server-side search requests) while keeping the raw, un-debounced
 * value available elsewhere for instant, client-side feedback.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
