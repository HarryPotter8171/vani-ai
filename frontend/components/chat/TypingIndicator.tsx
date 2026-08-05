'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import VaniLogo from '@/components/brand/VaniLogo';

export default function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex w-full justify-start py-4"
      role="status"
      aria-label="VANI is thinking"
    >
      <div className="flex max-w-[680px] items-start gap-3">
        <div className="mt-1.5 shrink-0" aria-hidden>
          <VaniLogo size="xs" glow />
        </div>

        <div
          className={cn(
            'flex items-center gap-1.5 rounded-[22px] rounded-bl-[6px] px-5 py-3.5',
            'bg-surface-secondary',
            'border border-border',
            'shadow-token-sm'
          )}
        >
          {[0, 0.15, 0.3].map((delay) => (
            <motion.div
              key={delay}
              animate={{ y: [0, -3, 0], opacity: [0.25, 0.9, 0.25] }}
              transition={{ repeat: Infinity, duration: 1.15, ease: 'easeInOut', delay }}
              className="h-1.5 w-1.5 rounded-full bg-accent/70"
 />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
