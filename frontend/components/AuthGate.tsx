'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import {
  resolveAccessToken,
  clearTokenCache,
  isBackendReachable,
  setBackendReachable,
  type AuthFailureReason,
} from '@/lib/apiClient';
import { isDevAuthClientEnabled } from '@/lib/auth/clientFlags';
import { clearClientAuthState } from '@/lib/auth/logout';
import VaniLogo from '@/components/brand/VaniLogo';
import { Button } from '@/components/ui/Button';
import { isDeveloperMode, logDevError } from '@/lib/userFacingError';

/** Hard ceiling — never show the splash longer than this, even if NextAuth hangs. */
const BOOT_SPLASH_MS = 1500;
const TOKEN_ENSURE_TIMEOUT_MS = 8_000;

/** Production-safe copy — never leak stacks / status / infra. */
const PROD_SIGN_IN_ERROR = 'Unable to sign in.\nPlease try again.';

type GateAuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

function AuthLoading({ label }: { label: string }) {
  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center gap-5 bg-background"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="app-background" aria-hidden>
        <div className="app-background-blobs">
          <span />
          <span />
          <span />
        </div>
      </div>
      <VaniLogo size="lg" glow />
      <div className="relative flex flex-col items-center gap-3">
        <div
          className="h-1 w-24 overflow-hidden rounded-full bg-surface-hover"
          aria-hidden
        >
          <div className="h-full w-1/2 animate-shimmer rounded-full bg-accent/50" />
        </div>
        <p className="text-sidebar font-medium tracking-[-0.014em] text-text-secondary">
          {label}
        </p>
      </div>
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
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 border-b border-border bg-surface-glass px-4 py-2.5 text-sm text-foreground backdrop-blur-xl pt-[max(0.5rem,env(safe-area-inset-top,0px))]"
    >
      <span className="text-text-secondary">
        Having trouble connecting. We&apos;ll keep trying.
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onRetry}
        disabled={retrying}
        className="min-h-[44px] bg-surface px-3 py-1 h-auto touch-manipulation sm:min-h-0"
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  );
}

function faceAuthError(reason?: AuthFailureReason | string | null): string {
  if (isDeveloperMode() && reason) {
    return `Unable to sign in (${reason}). Please try again.`;
  }
  return PROD_SIGN_IN_ERROR;
}

/**
 * Mobile-safe auth shell.
 *
 * NEVER throws during startup. Auth / token failures update controlled state
 * and show the login screen — React never crashes.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();
  const [bootDone, setBootDone] = useState(false);
  const [authStatus, setAuthStatus] = useState<GateAuthStatus>('loading');
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [devContinuing, setDevContinuing] = useState(false);
  const [signingOutFlag, setSigningOutFlag] = useState(false);
  const [backendDown, setBackendDown] = useState(false);
  const [retryingBackend, setRetryingBackend] = useState(false);
  const prevEmailRef = useRef<string | null>(null);
  const devAuth = isDevAuthClientEnabled();
  const isPublicShare = pathname?.startsWith('/share/') ?? false;
  const sessionEmail =
    sessionStatus === 'authenticated' && session?.user?.email
      ? String(session.user.email).toLowerCase()
      : null;
  const signingOut = sessionStatus === 'unauthenticated' ? false : signingOutFlag;

  const resetToLogin = (reason?: AuthFailureReason | string | null) => {
    clearTokenCache();
    clearClientAuthState();
    setAuthReady(false);
    setAuthStatus('unauthenticated');
    setBackendDown(false);
    if (reason) {
      logDevError({ reason }, 'AuthGate.reset');
      setError(faceAuthError(reason));
    } else {
      setError(null);
    }
  };

  // 1) Absolute splash ceiling — never infinite Loading on mobile.
  useEffect(() => {
    if (isDeveloperMode()) {
      console.info('[startup] AuthGate mounted');
    }
    const timer = setTimeout(() => {
      setBootDone(true);
    }, BOOT_SPLASH_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    if (sessionStatus !== 'loading') {
      setBootDone(true);
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (sessionStorage.getItem('vani.signingOut') === '1') {
        sessionStorage.removeItem('vani.signingOut');
        clearClientAuthState();
        setSigningOutFlag(true);
        setAuthReady(false);
        setAuthStatus('unauthenticated');
      }
    } catch {
      /* ignore */
    }
    const onSigningOut = () => {
      clearClientAuthState();
      setSigningOutFlag(true);
      setAuthReady(false);
      setAuthStatus('unauthenticated');
    };
    window.addEventListener('vani:signing-out', onSigningOut);
    return () => window.removeEventListener('vani:signing-out', onSigningOut);
  }, []);

  useEffect(() => {
    if (sessionStatus !== 'unauthenticated') return;
    try {
      localStorage.removeItem('nextauth.message');
    } catch {
      /* ignore */
    }
    clearTokenCache();
    prevEmailRef.current = null;
    setSigningOutFlag(false);
    setAuthReady(false);
    setAuthStatus('unauthenticated');
    setError(null);
  }, [sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !sessionEmail) return;
    const prev = prevEmailRef.current;
    prevEmailRef.current = sessionEmail;
    if (prev && prev !== sessionEmail) {
      clearTokenCache();
      setAuthReady(false);
      setAuthStatus('loading');
      setRetryToken((n) => n + 1);
    }
  }, [sessionStatus, sessionEmail]);

  // Background token mint — never blocks render, never throws into React.
  useEffect(() => {
    if (isPublicShare || signingOut) return;
    if (sessionStatus === 'loading') {
      setAuthStatus('loading');
      return;
    }
    if (sessionStatus === 'unauthenticated') {
      clearTokenCache();
      setAuthReady(false);
      setAuthStatus('unauthenticated');
      setBackendDown(false);
      return;
    }
    if (sessionStatus !== 'authenticated') return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const finishUnauthenticated = (reason: AuthFailureReason) => {
      if (cancelled || settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      // Invalid / expired session token → clear and show login (no crash).
      resetToLogin(reason);
    };

    const finishOk = () => {
      if (cancelled || settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      const reachable = isBackendReachable();
      setAuthReady(true);
      setAuthStatus('authenticated');
      setError(null);
      setBackendDown(!reachable);
    };

    const finishUnavailable = (reason: AuthFailureReason) => {
      if (cancelled || settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      clearTokenCache();
      setAuthReady(false);
      setBackendDown(true);
      // Soft failure: keep NextAuth session but mark gate as error so we can
      // still render the app chrome with a reconnect banner (guest-continue).
      setAuthStatus('error');
      setError(faceAuthError(reason));
      logDevError({ reason }, 'AuthGate.token');
    };

    timeoutId = setTimeout(() => {
      // Timeout must NOT throw — transition to unauthenticated and continue.
      if (cancelled || settled) return;
      settled = true;
      logDevError('Startup authentication timed out', 'AuthGate.timeout');
      clearTokenCache();
      setAuthReady(false);
      setAuthStatus('unauthenticated');
      setBackendDown(false);
      setError(faceAuthError('timeout'));
    }, TOKEN_ENSURE_TIMEOUT_MS);

    void (async () => {
      try {
        const result = await resolveAccessToken({ force: retryToken > 0 });
        if (cancelled || settled) return;

        if (result.authenticated) {
          finishOk();
          return;
        }

        if (
          result.reason === 'expired' ||
          result.reason === 'unauthenticated' ||
          result.reason === 'signed_out' ||
          result.reason === 'invalid_token'
        ) {
          finishUnauthenticated(result.reason);
          return;
        }

        // unavailable / unknown / timeout-like → reconnect UX, do not crash
        finishUnavailable(result.reason);
      } catch (err) {
        // Absolute safety — structured state only, never rethrow.
        logDevError(err, 'AuthGate.token');
        if (cancelled || settled) return;
        finishUnavailable('unknown');
      }
    })();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
    // resetToLogin is stable enough via closures; avoid re-running on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, isPublicShare, retryToken, signingOut, sessionEmail]);

  const continueAsDeveloper = async () => {
    if (devContinuing) return;
    setDevContinuing(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/dev-continue', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        logDevError(body.error || `dev-continue ${res.status}`, 'AuthGate.dev');
        setError(faceAuthError('unknown'));
        setAuthStatus('unauthenticated');
        setDevContinuing(false);
        return;
      }
      window.location.assign('/');
    } catch (err) {
      logDevError(err, 'AuthGate.dev');
      clearClientAuthState();
      setError(faceAuthError('unknown'));
      setAuthStatus('unauthenticated');
      setDevContinuing(false);
    }
  };

  const retryBackend = async () => {
    if (retryingBackend) return;
    setRetryingBackend(true);
    try {
      clearTokenCache();
      setBackendReachable(true);
      const result = await resolveAccessToken({ force: true });
      if (!result.authenticated) {
        if (
          result.reason === 'expired' ||
          result.reason === 'unauthenticated' ||
          result.reason === 'signed_out' ||
          result.reason === 'invalid_token'
        ) {
          resetToLogin(result.reason);
        } else {
          setBackendDown(true);
          setAuthStatus('error');
          setError(faceAuthError(result.reason));
        }
        return;
      }
      const reachable = isBackendReachable();
      setBackendDown(!reachable);
      if (reachable) {
        setError(null);
        setAuthReady(true);
        setAuthStatus('authenticated');
      }
    } catch (err) {
      logDevError(err, 'AuthGate.retry');
      setBackendDown(true);
      setAuthStatus('error');
      setError(faceAuthError('unavailable'));
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

  const fullyReady =
    authReady &&
    authStatus === 'authenticated' &&
    sessionStatus === 'authenticated' &&
    !!sessionEmail;

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

  // Soft backend failure while NextAuth session is valid → continue into app
  // (guest-continue) with reconnect banner. Never crash.
  if (
    sessionStatus === 'authenticated' &&
    sessionEmail &&
    (authStatus === 'error' || authStatus === 'loading' || authStatus === 'authenticated')
  ) {
    return (
      <Fragment key={sessionEmail}>
        {(backendDown || error || !authReady) && (
          <BackendReconnectBanner
            onRetry={() => void retryBackend()}
            retrying={retryingBackend}
          />
        )}
        {children}
      </Fragment>
    );
  }

  // Unauthenticated / unknown → sign-in (not a spinner, not a crash).
  const signInMessage = error
    ? error
    : 'Sign in to continue to your workspace.';

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
        <p className="max-w-[320px] whitespace-pre-line text-sidebar leading-relaxed tracking-[-0.012em] text-text-secondary">
          {signInMessage}
        </p>
      </div>
      <div className="relative flex flex-col items-center gap-2 sm:flex-row">
        <Button
          variant="primary"
          size="lg"
          className="min-h-[48px] px-6 duration-normal touch-manipulation"
          onClick={() => {
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
              setAuthStatus('loading');
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
