'use client';

import { useEffect } from 'react';
import { captureException } from '@/lib/monitoring';
import { ErrorState } from '@/components/ui/ErrorState';
import { isDeveloperMode, logDevError } from '@/lib/userFacingError';

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
 * App Router segment error boundary — never surfaces a raw auth crash.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const authFailure = isAuthFailure(error);

  useEffect(() => {
    captureException(error, { digest: error.digest, source: 'app/error' });
    logDevError(
      { message: error.message, digest: error.digest, name: error.name },
      'app/error'
    );
  }, [error]);

  if (authFailure) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-6">
        <ErrorState
          title="Unable to sign in"
          message={
            isDeveloperMode()
              ? error.message || PROD_SIGN_IN_ERROR
              : 'Please try again.'
          }
          onRetry={reset}
          retryLabel="Try again"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6">
      <ErrorState
        title="Something went wrong"
        message="An unexpected error occurred. You can try again, or reload if it continues."
        onRetry={reset}
        retryLabel="Try again"
      />
    </div>
  );
}
