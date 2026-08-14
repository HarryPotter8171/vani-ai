'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rounded pill / circle / custom radius */
  rounded?: 'sm' | 'md' | 'lg' | 'full' | 'none';
  /** Pulse instead of shimmer */
  pulse?: boolean;
}

const ROUND = {
  none: 'rounded-none',
  sm: 'rounded-[8px]',
  md: 'rounded-[14px]',
  lg: 'rounded-[20px]',
  full: 'rounded-full',
} as const;

/**
 * Premium shimmer skeleton — uses VANI shimmer token, respects reduced motion.
 */
export function Skeleton({
  className,
  rounded = 'md',
  pulse = false,
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden',
        ROUND[rounded],
        pulse
          ? 'animate-pulse bg-surface-hover'
          : cn(
              'vani-skeleton',
              'bg-[linear-gradient(110deg,rgba(0,0,0,0.045)_8%,rgba(0,0,0,0.09)_18%,rgba(0,0,0,0.045)_33%)]',
              'dark:bg-[linear-gradient(110deg,rgba(255,255,255,0.035)_8%,rgba(255,255,255,0.08)_18%,rgba(255,255,255,0.035)_33%)]',
              'bg-[length:200%_100%] animate-shimmer'
            ),
        className
      )}
      {...props}
 />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex w-full flex-col gap-2.5', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          rounded="sm"
          className={cn(
            'h-3',
            i === lines - 1 ? 'w-[62%]' : i % 2 === 0 ? 'w-full' : 'w-[88%]'
          )}
 />
      ))}
    </div>
  );
}

export function SkeletonAvatar({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Skeleton
      rounded="full"
      className={className}
      style={{ width: size, height: size }}
 />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[18px] border border-border/60 p-4',
        'bg-surface-glass',
        className
      )}
      aria-hidden
    >
      <div className="flex items-center gap-3">
        <SkeletonAvatar size={40} />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-[45%]" rounded="sm" />
          <Skeleton className="h-2.5 w-[30%]" rounded="sm" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}

/** Compact list-row skeleton for files, memories, invoices, settings. */
export function SkeletonList({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('flex w-full flex-col gap-2', className)}
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-[14px] px-2.5 py-2.5"
          aria-hidden
        >
          <Skeleton rounded="lg" className="h-9 w-9 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton
              rounded="sm"
              className={cn('h-3', i % 2 === 0 ? 'w-[72%]' : 'w-[58%]')}
            />
            <Skeleton rounded="sm" className="h-2.5 w-[38%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
