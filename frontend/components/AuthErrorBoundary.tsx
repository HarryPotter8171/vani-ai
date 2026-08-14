'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { signIn } from 'next-auth/react';
import { clearTokenCache } from '@/lib/apiClient';
import { clearClientAuthState } from '@/lib/auth/logout';
import { isDeveloperMode, logDevError } from '@/lib/userFacingError';
import { Button } from '@/components/ui/Button';
import VaniLogo from '@/components/brand/VaniLogo';

const PROD_SIGN_IN_ERROR = 'Unable to sign in.\nPlease try again.';

function isAuthFailure(error: Error): boolean {
  const name = error.name || '';
  const message = error.message || '';
  if (name === 'AuthRequiredError') return true;
  return /auth|sign[\s-]?in|token|unauthorized|jwt|session|Startup authentication timed out/i.test(
    `${name} ${message}`
  );
}

interface AuthErrorBoundaryProps {
  children: ReactNode;
}

interface AuthErrorBoundaryState {
  error: Error | null;
  authFailure: boolean;
}

/**
 * Catches every render-time auth (and other) failure around AuthGate so users
 * never see a Next.js crash overlay / blank white screen.
 */
export default class AuthErrorBoundary extends Component<
  AuthErrorBoundaryProps,
  AuthErrorBoundaryState
> {
  state: AuthErrorBoundaryState = { error: null, authFailure: false };

  static getDerivedStateFromError(error: Error): AuthErrorBoundaryState {
    return { error, authFailure: isAuthFailure(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logDevError(
      { error, componentStack: info.componentStack },
      'AuthErrorBoundary'
    );
    if (isAuthFailure(error)) {
      try {
        clearTokenCache();
        clearClientAuthState();
      } catch {
        /* never throw from the boundary */
      }
    }
  }

  reset = (): void => {
    try {
      clearTokenCache();
    } catch {
      /* ignore */
    }
    this.setState({ error: null, authFailure: false });
  };

  render(): ReactNode {
    const { error, authFailure } = this.state;
    if (!error) return this.props.children;

    const message = authFailure
      ? PROD_SIGN_IN_ERROR
      : isDeveloperMode()
        ? error.message || PROD_SIGN_IN_ERROR
        : PROD_SIGN_IN_ERROR;

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
            <h1 className="type-heading text-foreground">VANI</h1>
            <p className="mt-1 text-sm font-medium tracking-[-0.01em] text-text-tertiary">
              AI Operating System
            </p>
          </div>
          <p
            role="alert"
            className="max-w-[320px] whitespace-pre-line text-sidebar leading-relaxed tracking-[-0.012em] text-text-secondary"
          >
            {message}
          </p>
        </div>
        <div className="relative flex flex-col items-center gap-2 sm:flex-row">
          {authFailure ? (
            <Button
              variant="primary"
              size="lg"
              className="min-h-[48px] px-6 touch-manipulation"
              onClick={() => {
                this.reset();
                void signIn('google');
              }}
            >
              Continue with Google
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="lg"
            className="border-border bg-surface-glass px-5 backdrop-blur-xl hover:bg-surface-hover"
            onClick={this.reset}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }
}
