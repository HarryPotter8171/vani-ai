'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type VaniOrbState =
  | 'idle'
  | 'thinking'
  | 'listening'
  | 'speaking'
  | 'researching'
  | 'image';

export interface VaniOrbProps {
  state?: VaniOrbState;
  size?: number;
  className?: string;
  /** Soft bloom behind the orb */
  glow?: boolean;
}

const STATE_LABEL: Record<VaniOrbState, string> = {
  idle: 'Ready',
  thinking: 'Thinking',
  listening: 'Listening',
  speaking: 'Speaking',
  researching: 'Researching',
  image: 'Creating',
};

/**
 * Signature VANI Orb — ambient AI presence with state-driven motion.
 * GPU-friendly transforms/opacity only; respects prefers-reduced-motion.
 */
export default function VaniOrb({
  state = 'idle',
  size = 72,
  className,
  glow = true,
}: VaniOrbProps) {
  const reduceMotion = useReducedMotion();
  const uid = React.useId().replace(/:/g, '');

  const coreScale =
    state === 'speaking'
      ? [1, 1.08, 1]
      : state === 'listening'
        ? [1, 1.05, 1]
        : state === 'thinking' || state === 'researching'
          ? [1, 1.03, 0.98, 1]
          : state === 'image'
            ? [1, 1.06, 1]
            : [1, 1.02, 1];

  const duration =
    state === 'speaking'
      ? 1.4
      : state === 'listening'
        ? 1.8
        : state === 'thinking'
          ? 2.4
          : state === 'researching'
            ? 3.2
            : state === 'image'
              ? 2.6
              : 4.5;

  const ringSpeed =
    state === 'thinking'
      ? 3.2
      : state === 'researching'
        ? 4.5
        : state === 'image'
          ? 2.8
          : 0;

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`VANI ${STATE_LABEL[state]}`}
    >
      {glow ? (
        <motion.div
          className="pointer-events-none absolute inset-[-35%] rounded-full"
          style={{
            background:
              state === 'speaking'
                ? `radial-gradient(circle, color-mix(in srgb, var(--accent) 42%, transparent) 0%, transparent 70%)`
                : state === 'listening'
                  ? `radial-gradient(circle, color-mix(in srgb, var(--accent) 34%, transparent) 0%, transparent 70%)`
                  : state === 'image'
                    ? `radial-gradient(circle, color-mix(in srgb, #c4b5fd 36%, transparent) 0%, transparent 70%)`
                    : `radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 70%)`,
          }}
          animate={
            reduceMotion
              ? { opacity: 0.7 }
              : { opacity: [0.55, 0.9, 0.55], scale: [0.92, 1.05, 0.92] }
          }
          transition={{ duration: duration * 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : null}

      {/* Outer orbital ring */}
      {(state === 'thinking' || state === 'researching' || state === 'image') && !reduceMotion ? (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
            borderTopColor: 'var(--accent)',
            borderRightColor: 'transparent',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: ringSpeed || 3, repeat: Infinity, ease: 'linear' }}
        />
      ) : null}

      {/* Secondary counter-ring for research */}
      {state === 'researching' && !reduceMotion ? (
        <motion.div
          className="absolute inset-[6px] rounded-full"
          style={{
            border: '1px dashed color-mix(in srgb, var(--accent) 28%, transparent)',
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
        />
      ) : null}

      <motion.div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: size * 0.72,
          height: size * 0.72,
          background:
            'radial-gradient(circle at 35% 30%, color-mix(in srgb, white 22%, var(--accent)) 0%, var(--accent) 45%, color-mix(in srgb, var(--accent) 70%, var(--accent-pressed)) 100%)',
          boxShadow:
            '0 0 0 1px color-mix(in srgb, white 18%, transparent), 0 8px 28px color-mix(in srgb, var(--accent) 40%, transparent), inset 0 1px 0 color-mix(in srgb, white 35%, transparent)',
        }}
        animate={reduceMotion ? { scale: 1 } : { scale: coreScale }}
        transition={{ duration, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg
          width={size * 0.34}
          height={size * 0.34}
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden
        >
          <defs>
            <linearGradient id={`orb-mark-${uid}`} x1="6" y1="6" x2="26" y2="28">
              <stop stopColor="#fff" stopOpacity="1" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.82" />
            </linearGradient>
          </defs>
          <path
            d="M7.2 8.2L14.55 24.4c.32.7 1.38.7 1.7 0L23.8 8.2"
            stroke={`url(#orb-mark-${uid})`}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Listening / speaking waveform dots */}
          {(state === 'listening' || state === 'speaking') && (
            <>
              <motion.circle
                cx="11"
                cy="16"
                r="1.2"
                fill="#fff"
                opacity="0.7"
                animate={reduceMotion ? {} : { cy: [16, 13, 16], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.circle
                cx="16"
                cy="16"
                r="1.2"
                fill="#fff"
                opacity="0.9"
                animate={reduceMotion ? {} : { cy: [16, 11, 16], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay: 0.12 }}
              />
              <motion.circle
                cx="21"
                cy="16"
                r="1.2"
                fill="#fff"
                opacity="0.7"
                animate={reduceMotion ? {} : { cy: [16, 14, 16], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay: 0.24 }}
              />
            </>
          )}
        </svg>
      </motion.div>

      {/* Idle pulse ring */}
      {state === 'idle' && !reduceMotion ? (
        <motion.div
          className="pointer-events-none absolute inset-[8%] rounded-full border border-accent/25"
          animate={{ scale: [1, 1.18], opacity: [0.45, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeOut' }}
        />
      ) : null}
    </div>
  );
}
