'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ErrorState } from '@/components/ui/ErrorState';
import { getUserFriendlyError } from '@/lib/userFacingError';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback; defaults to shared ErrorState with retry. */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Called when an error is caught (for logging / telemetry). */
  onError?: (error: Error, info: ErrorInfo) => void;
  className?: string;
  /** Soft label shown above the error message. */
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Host-side React error boundary for artifact UI chrome.
 * Preview iframe crashes are handled separately via the sandboxed runtime overlay.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
    if (typeof console !== 'undefined') {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[ErrorBoundary]', error, info.componentStack);
      } else {
        console.error('[ErrorBoundary]', error.name || 'Error');
      }
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { fallback, className, title = 'Something went wrong' } = this.props;
    if (typeof fallback === 'function') return fallback(error, this.reset);
    if (fallback) return fallback;

    const isAuth =
      error.name === 'AuthRequiredError' ||
      /auth|sign[\s-]?in|token|unauthorized|jwt|session/i.test(
        `${error.name} ${error.message}`
      );

    return (
      <div className={cn('flex items-center justify-center p-4', className)}>
        <ErrorState
          compact
          title={isAuth ? 'Unable to sign in' : title}
          message={
            isAuth
              ? 'Please try again.'
              : getUserFriendlyError(error, {
                  fallback: 'Please try again in a moment.',
                })
          }
          onRetry={this.reset}
        />
      </div>
    );
  }
}
