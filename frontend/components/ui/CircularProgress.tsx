'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
  sublabel?: string;
}

export default function CircularProgress({
  value,
  max = 100,
  size = 64,
  strokeWidth = 5,
  className,
  label,
  sublabel,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
  const offset = circumference * (1 - pct);

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} className="progress-ring">
        <circle
          className="progress-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
        />
        <circle
          className="progress-ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {(label || sublabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {label ? (
            <span className="text-sm font-semibold tracking-[-0.03em] tabular-nums text-foreground">
              {label}
            </span>
          ) : null}
          {sublabel ? (
            <span className="text-micro font-medium uppercase tracking-[0.04em] text-text-tertiary">
              {sublabel}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function MiniChart({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className={cn('mini-chart', className)} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          style={{
            height: `${Math.max(12, (v / max) * 100)}%`,
            animationDelay: `${i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}
