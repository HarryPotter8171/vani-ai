'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Invokes `handler` when a click occurs outside `ref`'s element, or when
 * Escape is pressed. Listens in the capture phase on `document` so the
 * dismissal is reliable regardless of how descendant click handlers manage
 * propagation.
 */
export function useOnClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    const onClick = (event: MouseEvent) => {
      const el = ref.current;
      if (!el || el.contains(event.target as Node)) return;
      handler();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler();
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [ref, handler, enabled]);
}
