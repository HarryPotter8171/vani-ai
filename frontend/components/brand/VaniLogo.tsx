'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type VaniLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero' | 'msg';

const SIZE_MAP: Record<VaniLogoSize, { box: number; mark: number }> = {
  xs: { box: 22, mark: 13 },
  sm: { box: 28, mark: 16 },
  md: { box: 32, mark: 18 },
  lg: { box: 40, mark: 22 },
  xl: { box: 48, mark: 26 },
  hero: { box: 64, mark: 34 },
  /** Message avatar — ChatGPT/Gemini-scale mark */
  msg: { box: 30, mark: 16 },
};

export interface VaniLogoProps {
  size?: VaniLogoSize;
  /** Soft ambient glow behind the mark */
  glow?: boolean;
  className?: string;
  markClassName?: string;
}

/**
 * VANI brand mark — continuous voice-wave V with a neural core and
 * infinity conversation arcs. Recognizable silhouette, purple-indigo identity.
 */
export function VaniMark({ size = 24, className }: { size?: number; className?: string }) {
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={`vani-mark-${uid}`} x1="6" y1="6" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      {/* Infinity / conversation loops */}
      <path
        d="M9 11.5c-2.6 2-2.8 5.8-.2 7.8 1.6 1.2 3.8 1.15 5.6.15"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.32"
 />
      <path
        d="M23 11.5c2.6 2 2.8 5.8.2 7.8-1.6 1.2-3.8 1.15-5.6.15"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.32"
 />

      {/* Voice-wave V */}
      <path
        d="M7.2 8.2L14.55 24.4c.32.7 1.38.7 1.7 0L23.8 8.2"
        stroke={`url(#vani-mark-${uid})`}
        strokeWidth="2.55"
        strokeLinecap="round"
        strokeLinejoin="round"
 />

      {/* Inner resonance stroke */}
      <path
        d="M11.2 12.2L15.4 21.4c.18.4.78.4.96 0L20.6 12.2"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
        opacity="0.35"
 />

      {/* Neural intelligence node */}
      <circle cx="16" cy="17.2" r="2.35" fill="currentColor" />
      <circle cx="16" cy="17.2" r="4" stroke="currentColor" strokeWidth="1" opacity="0.28" />
      <circle cx="16" cy="17.2" r="5.6" stroke="currentColor" strokeWidth="0.75" opacity="0.12" />
    </svg>
  );
}

export default function VaniLogo({
  size = 'md',
  glow = false,
  className,
  markClassName,
}: VaniLogoProps) {
  const { box, mark } = SIZE_MAP[size];

  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center', className)}>
      {glow && (
        <>
          <div
            className="pointer-events-none absolute inset-0 scale-[2] rounded-full bg-accent/30 blur-2xl"
            aria-hidden
 />
          <div
            className="pointer-events-none absolute inset-0 scale-[1.35] rounded-full bg-accent/20 blur-lg"
            aria-hidden
 />
        </>
      )}
      <div
        className={cn(
          'relative flex items-center justify-center rounded-[24%]',
          'bg-gradient-to-br from-accent-hover via-accent to-[var(--accent-pressed)]',
          'text-text-on-accent',
          'shadow-[0_2px_16px_var(--accent-glow),inset_0_0.5px_0_rgba(255,255,255,0.32)]',
          'ring-1 ring-white/20',
          markClassName
        )}
        style={{ width: box, height: box }}
      >
        <VaniMark size={mark} />
      </div>
    </div>
  );
}
