import { getApiBaseUrl } from '@/lib/constants';
import {
  clearTokenCache,
  getAccessTokenForLogout,
} from '@/lib/apiClient';

/** Keys that hold user/session data and must not survive logout. */
const USER_DATA_STORAGE_KEYS = [
  'vani.research.interruptedSession',
  'nextauth.message',
] as const;

/** Theme preference is unrelated to auth — keep it across logout. */
const PRESERVE_LOCAL_STORAGE_KEYS = new Set(['vani-theme']);

/**
 * Wipe client caches tied to the signed-in user.
 * Safe to call multiple times; never throws.
 */
export function clearClientAuthState() {
  clearTokenCache();

  if (typeof window === 'undefined') return;

  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }

  try {
    for (const key of USER_DATA_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
    // Remove any other app keys that may hold user data; preserve theme only.
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (PRESERVE_LOCAL_STORAGE_KEYS.has(key)) continue;
      if (
        key.startsWith('vani.') ||
        key.startsWith('vani-') ||
        key.startsWith('nextauth') ||
        key.startsWith('next-auth')
      ) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Signal AuthGate to drop authenticated chrome immediately, then revoke
 * backend JWT and wipe client caches. Callers must also call NextAuth
 * `signOut` so the session cookie and UI identity clear together.
 *
 * Does not store identity in localStorage/sessionStorage — only a transient
 * `vani.signingOut` UX flag that is cleared during wipe.
 */
export async function logoutFromBackend() {
  const token = getAccessTokenForLogout();

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem('vani.signingOut', '1');
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event('vani:signing-out'));
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    await fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
        : { 'Content-Type': 'application/json' },
      cache: 'no-store',
      // Don't hang the UI if the API is slow — session clear still proceeds.
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {
    /* still clear client state below */
  } finally {
    clearClientAuthState();
  }
}
