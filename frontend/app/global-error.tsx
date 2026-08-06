'use client';

import { useEffect } from 'react';
import { captureException } from '@/lib/monitoring';

/**
 * Root-level error boundary — replaces the root layout when it itself
 * crashes. Must render its own <html>/<body>. Kept minimal and friendly.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { digest: error.digest, source: 'app/global-error' });
  }, [error]);

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
            Something went wrong
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: '#6e6e73', margin: '0 0 12px' }}>
            VANI AI hit an unexpected error. Please try again.
          </p>
          {error.digest ? (
            <p
              style={{
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 11,
                color: '#86868b',
                margin: '0 0 12px',
              }}
            >
              Error ID: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: '#d70015',
              background: 'rgba(255, 59, 48, 0.1)',
              border: 'none',
              borderRadius: 8,
              padding: '6px 10px',
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
