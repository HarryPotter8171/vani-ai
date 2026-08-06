'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  clearAllMemoryPrefs,
  clearMemoryTemporary,
  forgetMemoryPrefIds,
  getMemoryPrefs,
  isMemoryPinned,
  isMemoryTemporary,
  pruneExpiredTemporary,
  setMemoryTemporary,
  toggleMemoryPinned,
  type MemoryPrefs,
} from '@/lib/memoryPrefs';

export function useMemoryPrefs() {
  const [prefs, setPrefs] = useState<MemoryPrefs>(() =>
    typeof window === 'undefined' ? { pinnedIds: [], temporary: {} } : getMemoryPrefs()
  );

  useEffect(() => {
    setPrefs(pruneExpiredTemporary());
  }, []);

  const refresh = useCallback(() => {
    setPrefs(pruneExpiredTemporary());
  }, []);

  const togglePin = useCallback((id: string) => {
    setPrefs(toggleMemoryPinned(id));
  }, []);

  const markTemporary = useCallback((id: string, days = 7) => {
    setPrefs(setMemoryTemporary(id, days));
  }, []);

  const clearTemporary = useCallback((id: string) => {
    setPrefs(clearMemoryTemporary(id));
  }, []);

  const forgetIds = useCallback((ids: string[]) => {
    setPrefs(forgetMemoryPrefIds(ids));
  }, []);

  const clearAll = useCallback(() => {
    setPrefs(clearAllMemoryPrefs());
  }, []);

  return {
    prefs,
    refresh,
    togglePin,
    markTemporary,
    clearTemporary,
    forgetIds,
    clearAll,
    isPinned: (id: string) => isMemoryPinned(id, prefs),
    isTemporary: (id: string) => isMemoryTemporary(id, prefs),
  };
}
