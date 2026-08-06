'use client';

import { useCallback, useRef } from 'react';

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export interface UseLongPressOptions {
  /** Delay before firing (ms). Default 480 — feels native on iOS/Android. */
  delay?: number;
  /** Cancel if the finger moves more than this many px. */
  moveThreshold?: number;
  disabled?: boolean;
  onLongPress: (origin: { x: number; y: number }) => void;
}

/**
 * Touch/pen long-press + desktop right-click. Ignores mouse left-click
 * (desktop uses MessageActions / context menu separately).
 */
export function useLongPress({
  delay = 480,
  moveThreshold = 10,
  disabled,
  onLongPress,
}: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      // Mouse right-click handled via onContextMenu; left-click shouldn't long-press.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'mouse') return;

      firedRef.current = false;
      originRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        const origin = originRef.current ?? { x: e.clientX, y: e.clientY };
        // Light haptic when available (Android / some iOS PWAs).
        try {
          navigator.vibrate?.(12);
        } catch {
          /* ignore */
        }
        onLongPress(origin);
        clear();
      }, delay);
    },
    [clear, delay, disabled, onLongPress]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const origin = originRef.current;
      if (!origin || timerRef.current == null) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (dx * dx + dy * dy > moveThreshold * moveThreshold) clear();
    },
    [clear, moveThreshold]
  );

  const onPointerUp = useCallback(() => {
    clear();
  }, [clear]);

  const onPointerCancel = useCallback(() => {
    clear();
  }, [clear]);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      // Desktop / long-press synthesis: open the same action sheet.
      e.preventDefault();
      onLongPress({ x: e.clientX, y: e.clientY });
    },
    [disabled, onLongPress]
  );

  return {
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerCancel,
    onContextMenu,
  };
}

export default useLongPress;
