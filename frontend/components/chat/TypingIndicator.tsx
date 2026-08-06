'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';
import VaniLogo from '@/components/brand/VaniLogo';

const THINKING_MESSAGES = [
  'Thinking...',
  'Analyzing...',
  'Searching memory...',
  'Reasoning...',
  'Writing...',
] as const;

function pickThinkingMessage(exclude?: string): string {
  const pool =
    exclude && THINKING_MESSAGES.length > 1
      ? THINKING_MESSAGES.filter((m) => m !== exclude)
      : [...THINKING_MESSAGES];
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export default function TypingIndicator() {
  const [label, setLabel] = useState(() => pickThinkingMessage());

  useEffect(() => {
    const id = window.setInterval(() => {
      setLabel((prev) => pickThinkingMessage(prev));
    }, 2200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.28, ease: EASE.smooth }}
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
          'mt-1 flex min-h-[36px] w-fit max-w-[min(100%,280px)] items-center gap-2.5',
          'rounded-full px-3.5 py-2',
          'bg-surface-secondary/80 ring-1 ring-border-subtle/50',
          'shadow-[0_0_24px_-8px_color-mix(in_srgb,var(--accent)_35%,transparent)]',
          'backdrop-blur-sm'
        )}
      >
        <div className="flex items-center gap-1" aria-hidden>
          {[0, 0.16, 0.32].map((delay) => (
            <motion.span
              key={delay}
              animate={{ y: [0, -3.5, 0], opacity: [0.28, 1, 0.28] }}
              transition={{
                repeat: Infinity,
                duration: 1.1,
                ease: 'easeInOut',
                delay,
              }}
              className="h-1.5 w-1.5 rounded-full bg-accent"
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
              transition={{ duration: 0.28, ease: EASE.smooth }}
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
