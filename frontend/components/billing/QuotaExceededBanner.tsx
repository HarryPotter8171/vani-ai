'use client';

import { AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatResetDate,
  type GateDenial,
} from '@/lib/billing/gateError';

interface QuotaExceededBannerProps {
  denial: GateDenial;
  onUpgrade: () => void;
  onDismiss: () => void;
}

/**
 * Compact quota / plan denial strip — reuses existing amber/red banner patterns.
 * Does not redesign the app chrome; sits above the composer when a request is denied.
 */
export function QuotaExceededBanner({
  denial,
  onUpgrade,
  onDismiss,
}: QuotaExceededBannerProps) {
  const reset = formatResetDate(denial.resetDate);
  const remainingLabel =
    denial.remaining != null && denial.limit != null
      ? `${denial.remaining} of ${denial.limit} remaining`
      : denial.limit != null
        ? `Limit ${denial.limit}`
        : null;

  return (
    <div
      role="status"
      className={cn(
        'mx-auto mb-2 flex w-full max-w-full items-start gap-3 rounded-[16px] px-4 py-3 sm:px-6 md:max-w-3xl lg:max-w-[800px]',
        'max-md:mx-3 max-md:mb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]',
        'border border-amber-500/25 bg-amber-500/[0.08]',
        'backdrop-blur-xl shadow-token-sm'
      )}
    >
      <AlertCircle
        size={16}
        strokeWidth={2}
        className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
 />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug tracking-[-0.01em] text-foreground">
          {denial.message || denial.error}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted-foreground">
          {remainingLabel ? <span>{remainingLabel}</span> : null}
          {reset ? <span>Resets {reset}</span> : null}
          {denial.upgradeHint ? <span>{denial.upgradeHint}</span> : null}
        </div>
        <button
          type="button"
          onClick={onUpgrade}
          className={cn(
            'mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold tracking-[-0.01em] touch-manipulation',
            'text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200',
            'sm:min-h-0'
          )}
        >
          Upgrade plan
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className={cn(
          'shrink-0 rounded-full p-2 text-muted-foreground/60 touch-manipulation',
          'hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.08]',
          'min-h-[44px] min-w-[44px] inline-flex items-center justify-center sm:min-h-0 sm:min-w-0 sm:p-0.5'
        )}
      >
        <X size={16} />
      </button>
    </div>
  );
}
