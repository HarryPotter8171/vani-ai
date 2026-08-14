'use client';

import { useAudioUnlock } from '@/hooks/useAudioUnlock';

/** Client-only boot: unlocks speechSynthesis on first tap/click/key. */
export function AudioUnlockInit() {
  useAudioUnlock();
  return null;
}
