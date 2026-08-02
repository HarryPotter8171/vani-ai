'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex w-full justify-start px-3 py-4 md:px-4"
    >
      <div className="flex w-full max-w-[720px] items-start gap-3.5">
        <div className="relative mt-2 shrink-0">
          <div className="absolute inset-0 rounded-full bg-primary/15 blur-xl scale-[1.4]" />
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-[#0A84FF] to-[#0056D6] text-white shadow-[0_2px_10px_rgba(0,122,255,0.24)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" />
            </svg>
          </div>
        </div>

        <div
          className={cn(
            'flex items-center gap-2 rounded-[20px] px-5 py-3.5',
            'bg-white/[0.16] dark:bg-white/[0.045]',
            'backdrop-blur-2xl backdrop-saturate-[1.8]',
            'border border-black/[0.035] dark:border-white/[0.05]',
            'shadow-[0_1px_1px_rgba(0,0,0,0.012),0_12px_28px_rgba(0,0,0,0.03)]'
          )}
        >
          {[0, 0.18, 0.36].map((delay) => (
            <motion.div
              key={delay}
              animate={{ y: [0, -3, 0], opacity: [0.25, 0.85, 0.25] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut', delay }}
              className="h-1.5 w-1.5 rounded-full bg-foreground/35"
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
