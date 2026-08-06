'use client';

import { useEffect } from 'react';
import { captureException } from '@/lib/monitoring';
import { ErrorState } from '@/components/ui/ErrorState';

/**
 * App Router segment error boundary — premium retry surface aligned with VANI UI.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, { digest: error.digest, source: 'app/error' });
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6">
      <ErrorState
        title="Something went wrong"
        message={
          error.digest
            ? `An unexpected error occurred. Reference: ${error.digest}`
            : 'An unexpected error occurred. You can try again, or reload if it continues.'
        }
        onRetry={reset}
        retryLabel="Try again"
      />
    </div>
  );
}
