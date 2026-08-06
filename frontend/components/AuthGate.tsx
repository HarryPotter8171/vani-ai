'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import {
  getAccessToken,
  AuthRequiredError,
  clearTokenCache,
  isBackendReachable,
  setBackendReachable,
} from '@/lib/apiClient';
import { getApiBaseUrl } from '@/lib/constants';
import { isDevAuthClientEnabled } from '@/lib/auth/clientFlags';
import { clearClientAuthState } from '@/lib/auth/logout';
import VaniLogo from '@/components/brand/VaniLogo';
import { Button } from '@/components/ui/Button';

/** Hard ceiling — never show the splash longer than this, even if NextAuth hangs. */
const BOOT_SPLASH_MS = 1500;
const TOKEN_ENSURE_TIMEOUT_MS = 8_000;

function AuthLoading({ label }: { label: string }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-5 bg-background">
      <div className="app-background" aria-hidden>
        <div className="app-background-blobs">
          <span />
          <span />
          <span />
        </div>
      </div>
      <VaniLogo size="lg" glow />
      <p className="relative text-sidebar font-medium tracking-[-0.014em] text-text-secondary">
        {label}
      </p>
    </div>
  );
}

function BackendReconnectBanner({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 border-b border-border bg-surface-glass px-4 py-2 text-sm text-foreground backdrop-blur-xl"
    >
      <span className="text-text-secondary">
        Can&apos;t reach the API. Check that the backend is running on this Wi‑Fi.
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onRetry}
        disabled={retrying}
        className="bg-surface px-3 py-1 h-auto"
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  );
}

/**
 * Mobile-safe auth shell.
 *
 * EXACT infinite-loading cause (fixed):
 * Previously blocked on `!mounted || status === 'loading'` which never cleared
 * when client hydration / NextAuth session fetch stalled on LAN phones.
 *
 * Rules now:
 * - Splash at most BOOT_SPLASH_MS, then always render UI.
 * - Auth / backend token runs in the background — failure does not block the app.
 * - Unauthenticated users see the sign-in screen (not an infinite spinner).
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [bootDone, setBootDone] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [devContinuing, setDevContinuing] = useState(false);
  const [signingOutFlag, setSigningOutFlag] = useState(false);
  const [backendDown, setBackendDown] = useState(false);
  const [retryingBackend, setRetryingBackend] = useState(false);
  const prevEmailRef = useRef<string | null>(null);
  const loggedRef = useRef(false);
  const devAuth = isDevAuthClientEnabled();
  const isPublicShare = pathname?.startsWith('/share/') ?? false;
  const sessionEmail =
    status === 'authenticated' && session?.user?.email
      ? String(session.user.email).toLowerCase()
      : null;
  const signingOut = status === 'unauthenticated' ? false : signingOutFlag;

  // 1) Absolute splash ceiling — never infinite Loading on mobile.
  useEffect(() => {
    console.info('[startup] 1. AuthGate mounted', {
      href: typeof window !== 'undefined' ? window.location.href : null,
      apiBase: getApiBaseUrl(),
      nextAuthUrl: process.env.NEXT_PUBLIC_APP_URL,
      status,
    });
    const timer = setTimeout(() => {
      console.info('[startup] 2. boot splash ceiling reached — rendering UI');
      setBootDone(true);
    }, BOOT_SPLASH_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    console.info('[startup] 3. NextAuth status →', status, {
      email: session?.user?.email ?? null,
      provider: session?.user?.provider ?? null,
    });
    if (status !== 'loading') {
      setBootDone(true);
    }
  }, [status, session?.user?.email, session?.user?.provider]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (sessionStorage.getItem('vani.signingOut') === '1') {
        sessionStorage.removeItem('vani.signingOut');
        clearClientAuthState();
        setSigningOutFlag(true);
        setAuthReady(false);
      }
    } catch {
      /* ignore */
    }
    const onSigningOut = () => {
      clearClientAuthState();
      setSigningOutFlag(true);
      setAuthReady(false);
    };
    window.addEventListener('vani:signing-out', onSigningOut);
    return () => window.removeEventListener('vani:signing-out', onSigningOut);
  }, []);

  useEffect(() => {
    if (status !== 'unauthenticated') return;
    try {
      localStorage.removeItem('nextauth.message');
    } catch {
      /* ignore */
    }
    clearTokenCache();
    prevEmailRef.current = null;
    setSigningOutFlag(false);
    setAuthReady(false);
    setError(null);
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated' || !sessionEmail) return;
    const prev = prevEmailRef.current;
    prevEmailRef.current = sessionEmail;
    if (prev && prev !== sessionEmail) {
      clearTokenCache();
      setAuthReady(false);
      setRetryToken((n) => n + 1);
    }
  }, [status, sessionEmail]);

  // Background token mint — never blocks render.
  useEffect(() => {
    if (isPublicShare || signingOut) return;
    if (status === 'loading') {
      console.info('[startup] 4. waiting for NextAuth (non-blocking)');
      return;
    }
    if (status === 'unauthenticated') {
      console.info('[startup] 5. unauthenticated — sign-in UI');
      clearTokenCache();
      setAuthReady(false);
      setBackendDown(false);
      return;
    }
    if (status !== 'authenticated') return;

    let cancelled = false;
    console.info('[startup] 6. minting backend token', {
      email: sessionEmail,
      apiBase: getApiBaseUrl(),
    });

    const ensurePromise = getAccessToken({ force: retryToken > 0 });
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('Startup authentication timed out')),
        TOKEN_ENSURE_TIMEOUT_MS
      );
    });

    void Promise.race([ensurePromise, timeoutPromise])
      .then(() => {
        if (cancelled) return;
        const reachable = isBackendReachable();
        console.info('[startup] 7. token ready', { backendReachable: reachable });
        setAuthReady(true);
        setError(null);
        setBackendDown(!reachable);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[startup] 7. token failed — app still renders', err);
        clearTokenCache();
        setAuthReady(false);
        setBackendDown(true);
        setError(
          err instanceof AuthRequiredError
            ? 'Sign in to continue'
            : err instanceof Error
              ? err.message
              : 'Unable to authenticate'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [status, isPublicShare, retryToken, signingOut, sessionEmail]);

  useEffect(() => {
    if (loggedRef.current || !bootDone) return;
    loggedRef.current = true;
    console.info('[startup] 8. UI unlocked', {
      status,
      authReady,
      backendDown,
      apiBase: getApiBaseUrl(),
    });
  }, [bootDone, status, authReady, backendDown]);

  const continueAsDeveloper = async () => {
    if (devContinuing) return;
    setDevContinuing(true);
    setError(null);
    console.info('[startup] Continue as developer');
    try {
      const res = await fetch('/api/auth/dev-continue', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Unable to start development session');
      }
      window.location.assign('/');
    } catch (err) {
      clearClientAuthState();
      setError(err instanceof Error ? err.message : 'Unable to start development session');
      setDevContinuing(false);
    }
  };

  const retryBackend = async () => {
    if (retryingBackend) return;
    setRetryingBackend(true);
    console.info('[startup] retry backend');
    try {
      clearTokenCache();
      setBackendReachable(true);
      await getAccessToken({ force: true });
      const reachable = isBackendReachable();
      setBackendDown(!reachable);
      if (reachable) {
        setError(null);
        setAuthReady(true);
      }
    } catch (err) {
      console.warn('[startup] retry failed', err);
      setBackendDown(true);
    } finally {
      setRetryingBackend(false);
      setRetryToken((n) => n + 1);
    }
  };

  if (isPublicShare) {
    return <>{children}</>;
  }

  // Brief splash only — never forever.
  if (!bootDone || signingOut) {
    return (
      <AuthLoading label={signingOut ? 'Signing out…' : 'Loading…'} />
    );
  }

  const fullyReady = authReady && status === 'authenticated' && !!sessionEmail;

  // Authenticated + token OK → app
  if (fullyReady) {
    return (
      <Fragment key={sessionEmail}>
        {backendDown ? (
          <BackendReconnectBanner
            onRetry={() => void retryBackend()}
            retrying={retryingBackend}
          />
        ) : null}
        {children}
      </Fragment>
    );
  }

  // Authenticated but token/backend still settling or failed → still show app
  // (requirement: if auth fails, render the application anyway).
  if (status === 'authenticated' && sessionEmail) {
    return (
      <Fragment key={sessionEmail}>
        {(backendDown || error) && (
          <BackendReconnectBanner
            onRetry={() => void retryBackend()}
            retrying={retryingBackend}
          />
        )}
        {children}
      </Fragment>
    );
  }

  // Unauthenticated / unknown → sign-in (not a spinner).
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="app-background" aria-hidden>
        <div className="app-background-blobs">
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="relative flex flex-col items-center gap-4">
        <VaniLogo size="xl" glow />
        <div>
          <h1 className="type-heading text-foreground">
            VANI
          </h1>
          <p className="mt-1 text-sm font-medium tracking-[-0.01em] text-text-tertiary">
            AI Operating System
          </p>
        </div>
        <p className="max-w-[320px] text-sidebar leading-relaxed tracking-[-0.012em] text-text-secondary">
          {error || 'Sign in to continue to your workspace.'}
        </p>
      </div>
      <div className="relative flex flex-col items-center gap-2 sm:flex-row">
        <Button
          variant="primary"
          size="lg"
          className="px-6 duration-normal"
          onClick={() => {
            console.info('[startup] Continue with Google');
            void signIn('google');
          }}
        >
          Continue with Google
        </Button>
        {devAuth ? (
          <Button
            variant="secondary"
            size="lg"
            disabled={devContinuing}
            className="border-border bg-surface-glass px-5 backdrop-blur-xl hover:bg-surface-hover"
            onClick={() => void continueAsDeveloper()}
          >
            {devContinuing ? 'Continuing…' : 'Continue as developer'}
          </Button>
        ) : null}
        {error ? (
          <Button
            variant="secondary"
            size="lg"
            className="border-border bg-surface-glass px-5 backdrop-blur-xl hover:bg-surface-hover"
            onClick={() => {
              clearTokenCache();
              setError(null);
              setRetryToken((n) => n + 1);
            }}
          >
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
