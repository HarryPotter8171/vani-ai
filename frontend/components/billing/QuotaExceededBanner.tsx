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
        'mx-auto mb-2 flex w-full max-w-[800px] items-start gap-3 rounded-[16px] px-6 py-3',
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
          {denial.upgradeHint ? (
            <span className="hidden sm:inline">{denial.upgradeHint}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onUpgrade}
          className={cn(
            'mt-2 text-sm font-semibold tracking-[-0.01em]',
            'text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200'
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
          'shrink-0 rounded-full p-0.5 text-muted-foreground/60',
          'hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.08]'
        )}
      >
        <X size={14} />
      </button>
    </div>
  );
}
