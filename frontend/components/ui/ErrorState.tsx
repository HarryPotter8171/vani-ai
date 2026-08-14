'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { SPRING, EASE } from '@/lib/motion';
import { getUserFriendlyError } from '@/lib/userFacingError';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  className?: string;
  compact?: boolean;
}

/**
 * Premium error + retry surface — used for panels, chat history, stream failures.
 */
export function ErrorState({
  title = 'Something went wrong',
  message = 'Please try again in a moment.',
  onRetry,
  retryLabel = 'Try again',
  retrying = false,
  className,
  compact = false,
}: ErrorStateProps) {
  const friendlyMessage = getUserFriendlyError(message, 'Please try again in a moment.');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE.smooth }}
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2.5 px-4 py-6' : 'gap-3.5 px-6 py-10',
        className
      )}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        transition={SPRING.soft}
        className={cn(
          'flex items-center justify-center rounded-[18px]',
          compact ? 'h-10 w-10' : 'h-12 w-12',
          'bg-danger-muted text-danger',
          'ring-8 ring-danger/[0.04]'
        )}
        aria-hidden
      >
        <AlertTriangle size={compact ? 16 : 20} strokeWidth={1.75} />
      </motion.div>

      <div className="max-w-[320px]">
        <p
          className={cn(
            'font-semibold tracking-[-0.02em] text-foreground',
            compact ? 'text-sm' : 'text-body'
          )}
        >
          {title}
        </p>
        {friendlyMessage ? (
          <p
            className={cn(
              'mt-1 leading-[1.45] text-text-secondary',
              compact ? 'text-caption' : 'text-sm'
            )}
          >
            {friendlyMessage}
          </p>
        ) : null}
      </div>

      {onRetry ? (
        <motion.div whileTap={{ scale: 0.97 }}>
          <Button
            type="button"
            variant="primary"
            size="md"
            loading={retrying}
            onClick={onRetry}
            leftIcon={
              retrying ? undefined : <RefreshCw size={13} strokeWidth={2.25} />
            }
            className="min-h-[44px] shadow-1 touch-manipulation"
          >
            {retrying ? 'Retrying…' : retryLabel}
          </Button>
        </motion.div>
      ) : null}
    </motion.div>
  );
}

export default ErrorState;
