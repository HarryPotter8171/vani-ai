'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query. SSR-safe: returns `defaultValue` until mounted.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);

  return matches;
}

/** Tailwind `md` breakpoint — true on desktop chat layout (≥768px).
 * Defaults to `false` (mobile-first) until mounted so phones never flash a
 * desktop sidebar width / relative flex rail before the media query resolves.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)', false);
}

export default useMediaQuery;
