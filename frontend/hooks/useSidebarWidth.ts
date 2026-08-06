'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const SIDEBAR_WIDTH_DEFAULT = 280;
export const SIDEBAR_WIDTH_MIN = 70;
export const SIDEBAR_WIDTH_MAX = 360;
export const SIDEBAR_WIDTH_COLLAPSED = 70;
export const SIDEBAR_WIDTH_STORAGE_KEY = 'vani-sidebar-width';
export const SIDEBAR_WIDTH_TRANSITION_MS = 220;

function clampWidth(value: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(value)));
}

function readStoredWidth(): number {
  if (typeof window === 'undefined') return SIDEBAR_WIDTH_DEFAULT;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return SIDEBAR_WIDTH_DEFAULT;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return SIDEBAR_WIDTH_DEFAULT;
    return clampWidth(parsed);
  } catch {
    return SIDEBAR_WIDTH_DEFAULT;
  }
}

function persistWidth(width: number) {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Desktop sidebar width with localStorage persistence + drag-resize helpers.
 * Collapsed width is fixed at 70px; expanded restores the remembered custom width.
 */
export function useSidebarWidth() {
  const [width, setWidth] = useState(SIDEBAR_WIDTH_DEFAULT);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    setWidth(readStoredWidth());
  }, []);

  const commitWidth = useCallback((next: number) => {
    const clamped = clampWidth(next);
    setWidth(clamped);
    persistWidth(clamped);
    return clamped;
  }, []);

  const resetWidth = useCallback(() => {
    commitWidth(SIDEBAR_WIDTH_DEFAULT);
  }, [commitWidth]);

  const onResizeStart = useCallback(
    (clientX: number) => {
      dragRef.current = { startX: clientX, startWidth: width };
      setIsResizing(true);
    },
    [width]
  );

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      setWidth(clampWidth(drag.startWidth + delta));
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      setIsResizing(false);
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      commitWidth(drag.startWidth + delta);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isResizing, commitWidth]);

  return {
    width,
    isResizing,
    resetWidth,
    onResizeStart,
  };
}
