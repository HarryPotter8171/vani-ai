'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';
import VaniLogo from '@/components/brand/VaniLogo';
import type { StreamPhase } from '@/lib/types';
import { labelForPhase, STREAM_PHASE_LABELS } from '@/lib/chat/streamPhase';

const IDLE_CYCLE: StreamPhase[] = ['thinking', 'searching', 'writing'];

export interface TypingIndicatorProps {
  /** Driven by useChat stream events — overrides idle cycle when set. */
  phase?: StreamPhase | null;
}

/**
 * Premium VANI thinking state — branded aura + waveform, not three blinking dots.
 */
export default function TypingIndicator({ phase = null }: TypingIndicatorProps) {
  const [idlePhase, setIdlePhase] = useState<StreamPhase>('thinking');
  const label = phase ? labelForPhase(phase) : STREAM_PHASE_LABELS[idlePhase];

  useEffect(() => {
    if (phase) return;
    const id = window.setInterval(() => {
      setIdlePhase((prev) => {
        const idx = IDLE_CYCLE.indexOf(prev);
        return IDLE_CYCLE[(idx + 1) % IDLE_CYCLE.length]!;
      });
    }, 2200);
    return () => window.clearInterval(id);
  }, [phase]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2, ease: EASE.smooth }}
      className="mb-6 flex w-full items-start gap-3 py-1 max-md:mb-5"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="relative mt-0.5 shrink-0" aria-hidden>
        <VaniLogo size="msg" glow />
        <span className="thinking-aura pointer-events-none absolute inset-[-6px] rounded-full" />
      </div>

      <div
        className={cn(
          'mt-1 flex min-h-[36px] w-fit max-w-[min(100%,300px)] items-center gap-3',
          'rounded-full px-3.5 py-2',
          'bg-surface-secondary/80 ring-1 ring-border-subtle/50',
          'shadow-[0_0_24px_-8px_color-mix(in_srgb,var(--accent)_35%,transparent)]',
          'backdrop-blur-sm'
        )}
      >
        {/* VANI waveform — branded pulse bars, not chat-dot cliché */}
        <div className="thinking-wave flex h-4 items-end gap-[3px]" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.span
              key={i}
              className="w-[2.5px] rounded-full bg-accent"
              animate={{
                height: ['28%', '100%', '42%', '88%', '28%'],
                opacity: [0.35, 1, 0.55, 0.95, 0.35],
              }}
              transition={{
                repeat: Infinity,
                duration: 1.15,
                ease: 'easeInOut',
                delay: i * 0.09,
              }}
              style={{ height: '40%' }}
            />
          ))}
        </div>

        <div className="relative h-[1.15em] min-w-[7.5rem] overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={label}
              initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
              transition={{ duration: 0.18, ease: EASE.smooth }}
              className="absolute inset-x-0 text-sm font-medium tracking-[-0.02em] text-text-secondary"
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
