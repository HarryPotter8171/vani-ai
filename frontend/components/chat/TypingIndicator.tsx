'use client';

import React from 'react';
import { motion } from 'framer-motion';

export default function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex w-full justify-start px-1 py-4 md:px-2"
    >
      <div className="flex w-full max-w-[680px] items-start gap-4">
        <div className="relative mt-2 shrink-0">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl scale-[1.6]" />
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-[#007AFF] to-[#0056D6] text-white shadow-[0_4px_16px_rgba(0,122,255,0.3)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" />
            </svg>
          </div>
        </div>

        <div className="ai-message-card mt-0.5 flex items-center gap-2 px-6 py-4">
          {[0, 0.18, 0.36].map((delay) => (
            <motion.div
              key={delay}
              animate={{ y: [0, -3, 0], opacity: [0.3, 0.9, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut', delay }}
              className="h-[7px] w-[7px] rounded-full bg-foreground/40"
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
