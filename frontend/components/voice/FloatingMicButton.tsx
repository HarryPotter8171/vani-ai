'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Loader2, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FloatingMicButtonProps {
  visible: boolean;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

/**
 * ChatGPT-style floating microphone FAB — tap once to start Voice Mode.
 * Hidden while a Live session is active (overlay / minimized orb take over).
 * Sized down on phones so it doesn't crowd the composer.
 */
export default function FloatingMicButton({
  visible,
  onClick,
  disabled,
  loading,
  className,
}: FloatingMicButtonProps) {
  const reduceMotion = useReducedMotion();
  if (!visible) return null;

  return (
    <motion.div
      className={cn(
        'pointer-events-none fixed z-[84]',
        'bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+4.25rem))]',
        'right-[max(0.875rem,env(safe-area-inset-right))]',
        'sm:bottom-8 sm:right-8',
        className
      )}
      initial={{ opacity: 0, y: 16, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        aria-label={loading ? 'Requesting microphone access' : 'Start voice mode'}
        aria-busy={loading || undefined}
        title={loading ? 'Requesting microphone…' : 'Voice mode'}
        className={cn(
          'pointer-events-auto group relative flex h-12 w-12 items-center justify-center',
          'rounded-full border border-white/10 touch-manipulation',
          'bg-[#141414] text-white shadow-[0_10px_32px_rgba(0,0,0,0.42)]',
          'transition-transform active:scale-[0.94]',
          'hover:bg-[#1c1c1c] hover:border-white/20',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
          'disabled:pointer-events-none disabled:opacity-40',
          'sm:h-14 sm:w-14 md:h-16 md:w-16'
        )}
      >
        {!reduceMotion && !loading ? (
          <span
            className="pointer-events-none absolute inset-0 rounded-full bg-white/5 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        ) : null}
        {!reduceMotion && !loading ? (
          <span
            className="pointer-events-none absolute -inset-1 rounded-full border border-white/10 opacity-60"
            aria-hidden
          />
        ) : null}
        {loading ? (
          <Loader2
            className="relative h-5 w-5 animate-spin sm:h-6 sm:w-6 md:h-7 md:w-7"
            strokeWidth={1.75}
            aria-hidden
          />
        ) : (
          <Mic className="relative h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" strokeWidth={1.75} />
        )}
      </button>
    </motion.div>
  );
}
