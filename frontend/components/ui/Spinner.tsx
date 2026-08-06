'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface SpinnerProps {
  size?: number;
  className?: string;
  /** Soft label announced to assistive tech */
  label?: string;
  /** Accent ring vs muted */
  tone?: 'accent' | 'muted' | 'inverse';
  /** Accepted for drop-in Lucide icon compatibility */
  strokeWidth?: number;
}

/**
 * Premium dual-arc spinner — replaces default Loader2 / animate-spin glyphs.
 */
export function Spinner({
  size = 18,
  className,
  label = 'Loading',
  tone = 'accent',
  strokeWidth: _strokeWidth,
}: SpinnerProps) {
  const stroke =
    tone === 'inverse'
      ? 'stroke-white'
      : tone === 'muted'
        ? 'stroke-text-tertiary'
        : 'stroke-accent';

  return (
    <span
      role="status"
      aria-label={label}
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="vani-spinner"
        aria-hidden
      >
        <circle
          cx="12"
          cy="12"
          r="9.25"
          strokeWidth="2"
          className="stroke-current opacity-[0.18]"
 />
        <circle
          cx="12"
          cy="12"
          r="9.25"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeDasharray="18 42"
          className={cn(stroke, 'vani-spinner-arc')}
 />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Compact inline loading row used in panels / lists */
export function LoadingRow({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2.5 py-8 text-sm text-text-secondary',
        className
      )}
    >
      <Spinner size={16} />
      <span className="tracking-[-0.014em]">{label}</span>
    </div>
  );
}

export default Spinner;
