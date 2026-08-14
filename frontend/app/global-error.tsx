'use client';

import { useEffect } from 'react';
import { captureException } from '@/lib/monitoring';

const PROD_SIGN_IN_ERROR = 'Unable to sign in.\nPlease try again.';

function isAuthFailure(error: Error): boolean {
  const name = error.name || '';
  const message = error.message || '';
  if (name === 'AuthRequiredError') return true;
  return /auth|sign[\s-]?in|token|unauthorized|jwt|session|Startup authentication timed out/i.test(
    `${name} ${message}`
  );
}

/**
 * Root-level error boundary — replaces the root layout when it itself
 * crashes. Must render its own <html>/<body>. Auth failures never show a
 * raw crash screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const authFailure = isAuthFailure(error);

  useEffect(() => {
    captureException(error, { digest: error.digest, source: 'app/global-error' });
    if (process.env.NODE_ENV !== 'production') {
      console.error('[global error]', error.message, error.digest);
    } else {
      console.error('[global error]', error.name || 'Error');
    }
  }, [error]);

  const title = authFailure ? 'Unable to sign in' : 'Something went wrong';
  const body = authFailure
    ? PROD_SIGN_IN_ERROR
    : 'VANI hit an unexpected error. Please try again.';

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
          background: '#f5f5f7',
          color: '#1d1d1f',
          padding: 24,
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: 420,
            width: '100%',
            borderRadius: 14,
            border: '1px solid rgba(255, 59, 48, 0.2)',
            background: 'rgba(255, 59, 48, 0.06)',
            padding: '16px 18px',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: '#d70015', marginBottom: 8 }}>
            {title}
          </div>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: '#6e6e73',
              margin: '0 0 12px',
              whiteSpace: 'pre-line',
            }}
          >
            {body}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: '#d70015',
              background: 'rgba(255, 59, 48, 0.1)',
              border: 'none',
              borderRadius: 8,
              padding: '10px 14px',
              minHeight: 44,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
