'use client';

import { useEffect, useState } from 'react';

export interface VisualViewportState {
  /** Pixels the on-screen keyboard covers from the bottom of the layout viewport. */
  keyboardInset: number;
  /** Current visual viewport height. */
  height: number;
  /** visualViewport.offsetTop — useful when iOS shifts the viewport. */
  offsetTop: number;
}

const INITIAL: VisualViewportState = {
  keyboardInset: 0,
  height: 0,
  offsetTop: 0,
};

/**
 * Tracks the visual viewport so the floating composer can sit above the
 * soft keyboard and the message list can re-pin to the bottom.
 * No-ops / zero inset on desktop where the keyboard doesn't overlay.
 */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>(INITIAL);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) {
      setState({
        keyboardInset: 0,
        height: window.innerHeight,
        offsetTop: 0,
      });
      return;
    }

    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const keyboardInset = Math.max(
          0,
          Math.round(window.innerHeight - vv.height - vv.offsetTop)
        );
        setState((prev) => {
          if (
            prev.keyboardInset === keyboardInset &&
            prev.height === vv.height &&
            prev.offsetTop === vv.offsetTop
          ) {
            return prev;
          }
          return {
            keyboardInset,
            height: vv.height,
            offsetTop: vv.offsetTop,
          };
        });
      });
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return state;
}

export default useVisualViewport;
