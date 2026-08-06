'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FloatingMicButtonProps {
  visible: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * ChatGPT-style floating microphone FAB — tap once to start Voice Mode.
 * Hidden while a Live session is active (overlay / minimized orb take over).
 */
export default function FloatingMicButton({
  visible,
  onClick,
  disabled,
  className,
}: FloatingMicButtonProps) {
  const reduceMotion = useReducedMotion();
  if (!visible) return null;

  return (
    <motion.div
      className={cn(
        'pointer-events-none fixed z-[84]',
        'bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] right-4',
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
        disabled={disabled}
        aria-label="Start voice mode"
        title="Voice mode"
        className={cn(
          'pointer-events-auto group relative flex h-14 w-14 items-center justify-center',
          'rounded-full border border-white/10',
          'bg-[#141414] text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)]',
          'transition-transform active:scale-[0.94]',
          'hover:bg-[#1c1c1c] hover:border-white/20',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
          'disabled:pointer-events-none disabled:opacity-40',
          'sm:h-16 sm:w-16'
        )}
      >
        {!reduceMotion ? (
          <span
            className="pointer-events-none absolute inset-0 rounded-full bg-white/5 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        ) : null}
        {!reduceMotion ? (
          <span
            className="pointer-events-none absolute -inset-1 rounded-full border border-white/10 opacity-60"
            aria-hidden
          />
        ) : null}
        <Mic className="relative h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.75} />
      </button>
    </motion.div>
  );
}
