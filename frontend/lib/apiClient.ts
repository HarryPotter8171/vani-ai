import { getApiBaseUrl } from '@/lib/constants';
import { isDeveloperMode, logDevError } from '@/lib/userFacingError';

/**
 * @deprecated Never thrown into React. Kept only so legacy `instanceof` checks
 * compile; prefer {@link AccessTokenResult} / {@link resolveAccessToken}.
 */
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

export type AuthFailureReason =
  | 'expired'
  | 'unauthenticated'
  | 'signed_out'
  | 'timeout'
  | 'unavailable'
  | 'invalid_token'
  | 'unknown';

export type AccessTokenResult =
  | { authenticated: true; token: string }
  | { authenticated: false; reason: AuthFailureReason };

type TokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;
let inflight: Promise<AccessTokenResult> | null = null;
let syncedForToken: string | null = null;
/** Bumped on clear so in-flight mints cannot repopulate the cache after logout. */
let cacheGeneration = 0;
/** Last known backend reachability for startup / reconnect UI. */
let backendReachable = true;

const FETCH_TIMEOUT_MS = 8_000;

/** True for intentional cancel / barge-in aborts — not a real network failure. */
export function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    if (err.name === 'AbortError') return true;
  }
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    if (/aborted|AbortError/i.test(err.message)) return true;
  }
  if (typeof err === 'object' && err !== null && 'name' in err) {
    if ((err as { name?: unknown }).name === 'AbortError') return true;
  }
  return false;
}

export function isBackendReachable() {
  return backendReachable;
}

export function setBackendReachable(value: boolean) {
  backendReachable = value;
}

function authFail(reason: AuthFailureReason): AccessTokenResult {
  return { authenticated: false, reason };
}

function authOk(token: string): AccessTokenResult {
  return { authenticated: true, token };
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
  if (isDeveloperMode()) {
    console.info('[api] fetch →', finalUrl, init.method || 'GET');
  }

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
    // Caller cancelled via init.signal — rethrow AbortError (not a timeout).
    if (init.signal?.aborted) {
      throw isAbortError(err) ? err : new DOMException('Aborted', 'AbortError');
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new BackendUnavailableError(
        `Request timed out after ${timeoutMs}ms`
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch';
    logDevError(err, 'api.fetch');
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
  const cached = tokenCache;
  if (!cached?.token) return null;
  if (cached.expiresAt <= Date.now() + 15_000) return null;
  return cached.token;
}

/** Raw cached token for logout revoke — ignores near-expiry freshness window. */
export function getAccessTokenForLogout(): string | null {
  return tokenCache?.token ?? null;
}

type SyncResult =
  | { ok: true }
  | { ok: false; reason: AuthFailureReason };

/**
 * Sync Mongo user for the JWT. Never throws AuthRequiredError —
 * auth failures return `{ ok: false, reason }`.
 */
async function syncBackendUser(token: string): Promise<SyncResult> {
  if (!token) return { ok: false, reason: 'invalid_token' };
  if (syncedForToken === token) return { ok: true };
  const apiBase = getApiBaseUrl();
  if (isDeveloperMode()) {
    console.info('[startup] syncBackendUser →', `${apiBase}/auth/sync`);
  }
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
    logDevError(err, 'auth.sync');
    backendReachable = false;
    return { ok: false, reason: 'unavailable' };
  }
  if (res.status === 401) {
    clearTokenCache();
    return { ok: false, reason: 'expired' };
  }
  // Mongo down / boot race — never treat as auth failure that clears a good JWT.
  if (res.status === 503) {
    backendReachable = false;
    logDevError('auth/sync 503 DATABASE_UNAVAILABLE', 'auth.sync');
    return { ok: false, reason: 'unavailable' };
  }
  if (!res.ok) {
    backendReachable = false;
    logDevError(`Sync failed (${res.status})`, 'auth.sync');
    return { ok: false, reason: 'unavailable' };
  }
  syncedForToken = token;
  backendReachable = true;
  if (isDeveloperMode()) {
    console.info('[startup] syncBackendUser ok');
  }
  return { ok: true };
}

/**
 * Resolve a backend access JWT via the Next.js session bridge.
 * Never throws AuthRequiredError — always returns a structured result.
 * Never reads `tokenCache.token` without a null-safe snapshot.
 */
export async function resolveAccessToken(options?: {
  force?: boolean;
}): Promise<AccessTokenResult> {
  try {
    const cached = tokenCache;
    if (
      !options?.force &&
      cached?.token &&
      cached.expiresAt > Date.now() + 30_000
    ) {
      const cachedToken = cached.token;
      // Mint can succeed while /auth/sync fails (backend briefly down). Without
      // this retry, the cached JWT is reused forever and protected routes keep
      // returning USER_NOT_SYNCED until the token nears expiry or the user
      // clicks Retry.
      if (syncedForToken !== cachedToken) {
        const sync = await syncBackendUser(cachedToken);
        if (!sync.ok && (sync.reason === 'expired' || sync.reason === 'unauthenticated')) {
          clearTokenCache();
          return authFail(sync.reason);
        }
      }
      // Re-read after await — clearTokenCache may have run concurrently.
      const still = tokenCache?.token;
      if (!still) return authFail('signed_out');
      return authOk(still);
    }

    if (!options?.force && inflight) return inflight;

    const generation = cacheGeneration;
    const previousToken = tokenCache?.token || null;
    const apiBase = getApiBaseUrl();

    inflight = (async (): Promise<AccessTokenResult> => {
      if (isDeveloperMode()) {
        console.info('[startup] getAccessToken mint → /api/auth/backend-token', {
          apiBase,
        });
      }

      let res: Response;
      try {
        res = await fetchWithTimeout('/api/auth/backend-token', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
        });
      } catch (err) {
        logDevError(err, 'auth.mint');
        backendReachable = false;
        return authFail('unavailable');
      }

      if (res.status === 401) {
        clearTokenCache();
        return authFail('unauthenticated');
      }

      if (res.status === 503) {
        backendReachable = false;
        return authFail('unavailable');
      }

      if (!res.ok) {
        clearTokenCache();
        logDevError(`backend-token status ${res.status}`, 'auth.mint');
        return authFail('unknown');
      }

      let data: {
        token?: string;
        expiresAt?: number;
        expiresIn?: number;
      };
      try {
        data = (await res.json()) as typeof data;
      } catch (err) {
        clearTokenCache();
        logDevError(err, 'auth.mint');
        return authFail('invalid_token');
      }

      const minted = typeof data?.token === 'string' ? data.token : '';
      if (!minted) {
        clearTokenCache();
        return authFail('invalid_token');
      }

      if (generation !== cacheGeneration) {
        return authFail('signed_out');
      }

      const expiresAt =
        typeof data.expiresAt === 'number'
          ? data.expiresAt
          : Date.now() + (data.expiresIn || 3600) * 1000;

      if (previousToken && previousToken !== minted) {
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

      tokenCache = { token: minted, expiresAt };
      if (isDeveloperMode()) {
        console.info('[startup] backend-token minted');
      }

      const sync = await syncBackendUser(minted);
      if (!sync.ok && (sync.reason === 'expired' || sync.reason === 'unauthenticated')) {
        clearTokenCache();
        return authFail(sync.reason);
      }
      if (!sync.ok) {
        backendReachable = false;
        // Token is still usable for some routes; callers can retry sync.
        if (isDeveloperMode()) {
          console.warn('[startup] backend sync failed (continuing)', sync.reason);
        }
      }

      if (generation !== cacheGeneration) {
        clearTokenCache();
        return authFail('signed_out');
      }

      const confirmed = tokenCache?.token;
      if (!confirmed) return authFail('signed_out');
      return authOk(confirmed);
    })();

    try {
      return await inflight;
    } finally {
      if (inflight && generation === cacheGeneration) {
        inflight = null;
      }
    }
  } catch (err) {
    // Absolute safety net — never let auth exceptions escape into React.
    logDevError(err, 'auth.resolve');
    clearTokenCache();
    if (err instanceof BackendUnavailableError) {
      backendReachable = false;
      return authFail('unavailable');
    }
    return authFail('unknown');
  }
}

/**
 * Obtain a backend access JWT.
 * Returns `null` when unauthenticated — never throws AuthRequiredError.
 */
export async function getAccessToken(options?: {
  force?: boolean;
}): Promise<string | null> {
  const result = await resolveAccessToken(options);
  return result.authenticated ? result.token : null;
}

export async function authHeaders(
  extra?: HeadersInit,
  options?: { json?: boolean }
): Promise<HeadersInit> {
  const token = await getAccessToken();
  const headers = new Headers(extra);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
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

function unauthenticatedResponse(reason: AuthFailureReason): Response {
  return new Response(
    JSON.stringify({
      authenticated: false,
      reason,
      error: 'Authentication required',
    }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

function databaseUnavailableResponse(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      code: 'DATABASE_UNAVAILABLE',
      error: 'Database temporarily unavailable',
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Authenticated fetch against the Express API (getApiBaseUrl() + path).
 * `path` may be absolute (http...) or relative to the API base (e.g. `/chat/list`).
 * Auth failures return a 401 Response — they never throw AuthRequiredError.
 * 503 / timeouts never touch `token.token` on a null cache.
 */
export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const apiBase = getApiBaseUrl();
  const url = path.startsWith('http')
    ? path
    : `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;

  if (isDeveloperMode()) {
    console.info('[api] apiFetch →', url, init.method || 'GET', { apiBase, path });
  }

  const { json, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders || {});

  const isFormData =
    typeof FormData !== 'undefined' && rest.body instanceof FormData;
  if (json || (!isFormData && rest.body && !headers.has('Content-Type'))) {
    if (!isFormData) headers.set('Content-Type', 'application/json');
  }

  const send = async (token: string) => {
    if (!token) return unauthenticatedResponse('invalid_token');
    headers.set('Authorization', `Bearer ${token}`);
    try {
      return await fetch(url, { ...rest, headers });
    } catch (err) {
      // Barge-in / Stop / navigation abort — rethrow so callers can exit quietly.
      // Never wrap as BackendUnavailableError or log as a hard failure.
      if (isAbortError(err) || rest.signal?.aborted) {
        if (isAbortError(err)) throw err;
        throw new DOMException('Aborted', 'AbortError');
      }
      const message = err instanceof Error ? err.message : 'Failed to fetch';
      logDevError(err, 'apiFetch');
      throw new BackendUnavailableError(message);
    }
  };

  let tokenResult: AccessTokenResult;
  try {
    tokenResult = await resolveAccessToken();
  } catch (err) {
    logDevError(err, 'apiFetch.resolve');
    backendReachable = false;
    return databaseUnavailableResponse();
  }

  if (!tokenResult?.authenticated || !tokenResult.token) {
    if (tokenResult && !tokenResult.authenticated && tokenResult.reason === 'unavailable') {
      return databaseUnavailableResponse();
    }
    return unauthenticatedResponse(
      tokenResult && !tokenResult.authenticated ? tokenResult.reason : 'unauthenticated'
    );
  }

  let response: Response;
  try {
    response = await send(tokenResult.token);
  } catch (err) {
    if (err instanceof BackendUnavailableError) {
      backendReachable = false;
      return databaseUnavailableResponse();
    }
    throw err;
  }

  if (response.status === 503) {
    backendReachable = false;
    return response;
  }

  // One remint + retry for expired / revoked / not-yet-synced JWTs while the
  // NextAuth session is still valid. Does not loop — a second 401 stands.
  if (response.status === 401) {
    clearTokenCache();
    const fresh = await resolveAccessToken({ force: true });
    if (!fresh.authenticated || !fresh.token) {
      if (!fresh.authenticated && fresh.reason === 'unavailable') {
        return databaseUnavailableResponse();
      }
      return unauthenticatedResponse(
        !fresh.authenticated && fresh.reason === 'unknown' ? 'expired' : 
        !fresh.authenticated ? fresh.reason : 'expired'
      );
    }
    try {
      response = await send(fresh.token);
    } catch (err) {
      if (err instanceof BackendUnavailableError) {
        backendReachable = false;
        return databaseUnavailableResponse();
      }
      throw err;
    }
    if (response.status === 401) {
      clearTokenCache();
      return unauthenticatedResponse('expired');
    }
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

  if (isDeveloperMode()) {
    console.info('[api] apiUploadXHR →', url, { apiBase, path });
  }

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

  const tokenResult = await resolveAccessToken();
  if (!tokenResult.authenticated || !tokenResult.token) {
    const err = new Error('Authentication required') as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  try {
    return await runOnce(tokenResult.token);
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    if (status !== 401) throw err;
    clearTokenCache();
    const fresh = await resolveAccessToken({ force: true });
    if (!fresh.authenticated || !fresh.token) {
      const authErr = new Error('Authentication required') as Error & { status?: number };
      authErr.status = 401;
      throw authErr;
    }
    return runOnce(fresh.token);
  }
}
