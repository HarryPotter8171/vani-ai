'use client';

import { useEffect, useRef } from 'react';

const INTERACTION_EVENTS = ['touchstart', 'click'] as const;

/**
 * Unlocks the Web Speech API (`speechSynthesis`) on the first user gesture.
 * Mobile browsers (especially iOS Safari) block TTS until a prior interaction;
 * a silent utterance during that gesture readies Voice Mode / Listen.
 */
export function useAudioUnlock(): void {
  const unlockedRef = useRef(false);

  useEffect(() => {
    if (unlockedRef.current) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const onInteraction = () => {
      if (unlockedRef.current) return;

      try {
        const utterance = new SpeechSynthesisUtterance('');
        utterance.volume = 0;
        window.speechSynthesis.speak(utterance);
      } catch {
        /* ignore — still detach listeners after first gesture */
      }

      unlockedRef.current = true;
      for (const event of INTERACTION_EVENTS) {
        document.removeEventListener(event, onInteraction);
      }
    };

    for (const event of INTERACTION_EVENTS) {
      document.addEventListener(event, onInteraction, { passive: true });
    }

    return () => {
      for (const event of INTERACTION_EVENTS) {
        document.removeEventListener(event, onInteraction);
      }
    };
  }, []);
}
