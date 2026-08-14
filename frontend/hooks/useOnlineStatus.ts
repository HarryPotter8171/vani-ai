'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

function getSnapshot() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function getServerSnapshot() {
  return true;
}

/**
 * Live browser online/offline status. SSR-safe (assumes online on server).
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * True briefly after reconnecting so UI can show a "back online" moment.
 */
export function useWasOffline(): { online: boolean; justReconnected: boolean } {
  const online = useOnlineStatus();
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    if (!online) {
      setJustReconnected(false);
      return;
    }
    // Only flash "back online" if we previously saw offline in this session.
    const prev = sessionStorage.getItem('vani.wasOffline');
    if (prev === '1') {
      setJustReconnected(true);
      sessionStorage.removeItem('vani.wasOffline');
      const t = setTimeout(() => setJustReconnected(false), 2500);
      return () => clearTimeout(t);
    }
  }, [online]);

  useEffect(() => {
    if (!online) {
      try {
        sessionStorage.setItem('vani.wasOffline', '1');
      } catch {
        /* ignore */
      }
    }
  }, [online]);

  return { online, justReconnected };
}
