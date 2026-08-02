'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn, getGreeting } from '@/lib/utils';
import { SUGGESTION_CHIPS, USER_NAME } from '@/lib/constants';

interface EmptyStateProps {
  onSuggestionClick?: (text: string) => void;
}

export default function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <motion.div
      key="empty-state"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col items-center justify-center px-6 pt-[12vh] md:pt-[16vh] text-center"
    >
      {/* Apple Intelligence orb */}
      <div className="relative mb-10">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/25 via-accent/15 to-purple-500/15 blur-3xl scale-[2]" />
        <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-[#007AFF] via-[#5856D6] to-[#AF52DE] shadow-[0_8px_40px_rgba(88,86,214,0.35)] ring-1 ring-white/20">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="none">
            <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" />
          </svg>
        </div>
      </div>

      <h1 className="mb-3 text-[32px] md:text-[40px] font-semibold tracking-[-0.035em] text-foreground">
        {getGreeting()}, {USER_NAME}
      </h1>
      <p className="mb-12 text-[16px] tracking-[-0.01em] text-muted-foreground">
        How can I help you today?
      </p>

      <div className="flex flex-wrap justify-center gap-3 max-w-md">
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onSuggestionClick?.(chip)}
            className={cn(
              'glass-panel hover-lift px-5 py-3',
              'text-[13px] font-medium tracking-[-0.01em] text-foreground/75',
              'transition-all duration-300 ease-apple',
              'hover:text-foreground hover:shadow-glass-lg'
            )}
          >
            {chip}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
