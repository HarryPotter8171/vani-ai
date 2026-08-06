import { getApiBaseUrl } from '@/lib/constants';

export class AuthRequiredError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export class BackendUnavailableError extends Error {
  constructor(message = 'Backend unavailable') {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

type TokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;
let inflight: Promise<string> | null = null;
let syncedForToken: string | null = null;
/** Bumped on clear so in-flight mints cannot repopulate the cache after logout. */
let cacheGeneration = 0;
/** Last known backend reachability for startup / reconnect UI. */
let backendReachable = true;

const FETCH_TIMEOUT_MS = 8_000;

export function isBackendReachable() {
  return backendReachable;
}

export function setBackendReachable(value: boolean) {
  backendReachable = value;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const finalUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  console.info('[api] fetch →', finalUrl, init.method || 'GET');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const parent = init.signal;
    if (parent) {
      if (parent.aborted) controller.abort();
      else {
        parent.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new BackendUnavailableError(
        `Request timed out after ${timeoutMs}ms`
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch';
    console.error('[api] fetch FAILED →', finalUrl, message);
    throw new BackendUnavailableError(message);
  } finally {
    clearTimeout(timer);
  }
}

/** Clears the cached backend JWT — call on sign-out so the next session mints fresh. */
export function clearTokenCache() {
  tokenCache = null;
  syncedForToken = null;
  inflight = null;
  cacheGeneration += 1;
}

/** Synchronous peek for URL builders (img src). May be null before first fetch. */
export function getCachedAccessToken(): string | null {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 15_000) {
    return tokenCache.token;
  }
  return null;
}

/** Raw cached token for logout revoke — ignores near-expiry freshness window. */
export function getAccessTokenForLogout(): string | null {
  return tokenCache?.token ?? null;
}

async function syncBackendUser(token: string) {
  if (syncedForToken === token) return;
  const apiBase = getApiBaseUrl();
  console.info('[startup] syncBackendUser →', `${apiBase}/auth/sync`);
  let res: Response;
  try {
    res = await fetchWithTimeout(`${apiBase}/auth/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Backend unreachable';
    throw new BackendUnavailableError(message);
  }
  if (res.status === 401) {
    throw new AuthRequiredError();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new BackendUnavailableError(
      (body as { error?: string }).error || `Sync failed (${res.status})`
    );
  }
  syncedForToken = token;
  backendReachable = true;
  console.info('[startup] syncBackendUser ok');
}

/**
 * Obtain a backend access JWT via the Next.js session bridge, then sync the Mongo user.
 * Sync is best-effort: a down/unreachable Express API must not block the app forever.
 */
export async function getAccessToken(options?: {
  force?: boolean;
}): Promise<string> {
  if (
    !options?.force &&
    tokenCache &&
    tokenCache.expiresAt > Date.now() + 30_000
  ) {
    // Mint can succeed while /auth/sync fails (backend briefly down). Without
    // this retry, the cached JWT is reused forever and protected routes keep
    // returning USER_NOT_SYNCED until the token nears expiry or the user
    // clicks Retry.
    if (syncedForToken !== tokenCache.token) {
      try {
        await syncBackendUser(tokenCache.token);
      } catch (err) {
        if (err instanceof AuthRequiredError) throw err;
        backendReachable = false;
      }
    }
    return tokenCache.token;
  }

  if (!options?.force && inflight) return inflight;

  const generation = cacheGeneration;
  const previousToken = tokenCache?.token || null;
  const apiBase = getApiBaseUrl();

  inflight = (async () => {
    console.info('[startup] getAccessToken mint → /api/auth/backend-token', {
      apiBase,
    });
    const res = await fetchWithTimeout('/api/auth/backend-token', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });

    if (res.status === 401) {
      clearTokenCache();
      throw new AuthRequiredError();
    }

    if (!res.ok) {
      clearTokenCache();
      throw new Error('Unable to obtain access token');
    }

    const data = (await res.json()) as {
      token?: string;
      expiresAt?: number;
      expiresIn?: number;
    };

    if (!data.token) {
      clearTokenCache();
      throw new AuthRequiredError();
    }

    if (generation !== cacheGeneration) {
      throw new AuthRequiredError('Signed out');
    }

    const expiresAt =
      typeof data.expiresAt === 'number'
        ? data.expiresAt
        : Date.now() + (data.expiresIn || 3600) * 1000;

    if (previousToken && previousToken !== data.token) {
      void fetchWithTimeout(`${apiBase}/auth/revoke`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${previousToken}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }).catch(() => {});
    }

    tokenCache = { token: data.token, expiresAt };
    console.info('[startup] backend-token minted');

    try {
      await syncBackendUser(data.token);
    } catch (err) {
      if (err instanceof AuthRequiredError) throw err;
      backendReachable = false;
      console.warn('[startup] backend sync failed (continuing)', err);
    }

    if (generation !== cacheGeneration) {
      clearTokenCache();
      throw new AuthRequiredError('Signed out');
    }

    return data.token;
  })();

  try {
    return await inflight;
  } finally {
    if (inflight && generation === cacheGeneration) {
      inflight = null;
    }
  }
}

export async function authHeaders(
  extra?: HeadersInit,
  options?: { json?: boolean }
): Promise<HeadersInit> {
  const token = await getAccessToken();
  const headers = new Headers(extra);
  headers.set('Authorization', `Bearer ${token}`);
  if (options?.json !== false && !headers.has('Content-Type')) {
    // Only set JSON content-type when caller didn't already set it and body isn't FormData.
    // Callers using FormData should pass json: false.
  }
  if (options?.json) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

export type ApiFetchInit = RequestInit & {
  /** When true (default for object bodies), sets Content-Type: application/json */
  json?: boolean;
};

/**
 * Authenticated fetch against the Express API (getApiBaseUrl() + path).
 * `path` may be absolute (http...) or relative to the API base (e.g. `/chat/list`).
 */
export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const apiBase = getApiBaseUrl();
  const url = path.startsWith('http')
    ? path
    : `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;

  console.info('[api] apiFetch →', url, init.method || 'GET', { apiBase, path });

  const { json, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders || {});

  const isFormData =
    typeof FormData !== 'undefined' && rest.body instanceof FormData;
  if (json || (!isFormData && rest.body && !headers.has('Content-Type'))) {
    if (!isFormData) headers.set('Content-Type', 'application/json');
  }

  const send = async (token: string) => {
    headers.set('Authorization', `Bearer ${token}`);
    try {
      return await fetch(url, { ...rest, headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch';
      console.error('[api] apiFetch FAILED →', url, message);
      throw new BackendUnavailableError(message);
    }
  };

  let response = await send(await getAccessToken());

  // One remint + retry for expired / revoked / not-yet-synced JWTs while the
  // NextAuth session is still valid. Does not loop — a second 401 stands.
  if (response.status === 401) {
    clearTokenCache();
    try {
      const fresh = await getAccessToken({ force: true });
      response = await send(fresh);
    } catch {
      /* return original 401 — session may already be gone */
    }
    if (response.status === 401) clearTokenCache();
  }

  return response;
}

/** Upload helper: authenticated XHR with progress. */
export async function apiUploadXHR(
  path: string,
  form: FormData,
  options?: {
    signal?: AbortSignal;
    onProgress?: (event: { loaded: number; total: number; percent?: number }) => void;
  }
): Promise<unknown> {
  const apiBase = getApiBaseUrl();
  const url = path.startsWith('http')
    ? path
    : `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;

  console.info('[api] apiUploadXHR →', url, { apiBase, path });

  const runOnce = (token: string) =>
    new Promise<unknown>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.responseType = 'json';
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      const onAbort = () => xhr.abort();
      if (options?.signal) {
        if (options.signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      xhr.upload.onprogress = (event) => {
        if (!options?.onProgress) return;
        if (event.lengthComputable && event.total > 0) {
          options.onProgress({
            loaded: event.loaded,
            total: event.total,
            percent: Math.min(100, Math.round((event.loaded / event.total) * 100)),
          });
        } else {
          options.onProgress({ loaded: event.loaded, total: event.total });
        }
      };

      xhr.onload = () => {
        options?.signal?.removeEventListener('abort', onAbort);
        const status = xhr.status;
        const body =
          xhr.response && typeof xhr.response === 'object'
            ? xhr.response
            : (() => {
                try {
                  return JSON.parse(xhr.responseText || '{}');
                } catch {
                  return {};
                }
              })();

        if (status >= 200 && status < 300) {
          resolve(body);
          return;
        }
        const err = new Error(
          (body as { error?: string }).error || 'Upload failed'
        ) as Error & { status?: number };
        err.status = status;
        reject(err);
      };

      xhr.onerror = () => {
        options?.signal?.removeEventListener('abort', onAbort);
        reject(new Error('Network error while uploading files.'));
      };

      xhr.onabort = () => {
        options?.signal?.removeEventListener('abort', onAbort);
        reject(new DOMException('Aborted', 'AbortError'));
      };

      xhr.send(form);
    });

  const token = await getAccessToken();
  try {
    return await runOnce(token);
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    if (status !== 401) throw err;
    clearTokenCache();
    const fresh = await getAccessToken({ force: true });
    return runOnce(fresh);
  }
}
