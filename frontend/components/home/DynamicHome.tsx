'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn, getGreeting } from '@/lib/utils';
import { EASE, SPRING } from '@/lib/motion';
import { useAuthUser } from '@/hooks/useAuthUser';
import VaniOrb from '@/components/brand/VaniOrb';

export interface DynamicHomeProps {
  onSuggestionClick?: (text: string) => void;
  recentChats?: unknown[];
  recentProjects?: unknown[];
  activeProject?: unknown;
  knowledgeFiles?: string[];
  onSelectChat?: (chatId: string) => void;
  onSelectProject?: (projectId: string) => void;
  onOpenCanvas?: () => void;
  onOpenVoice?: () => void;
  onOpenDashboard?: () => void;
  onOpenMemory?: () => void;
}

/**
 * Empty-home hero — centered brand, greeting, and prompt.
 * Hidden once the first user message starts a conversation.
 */
export default function DynamicHome(_props: DynamicHomeProps) {
  const { firstName, status } = useAuthUser();
  const name = status === 'authenticated' ? firstName : null;
  const greeting = name ? `${getGreeting()}, ${name}` : getGreeting();

  return (
    <motion.div
      key="dynamic-home"
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: 1, y: -14 }}
      transition={{ duration: 0.4, ease: EASE.smooth }}
      className="mx-auto w-full max-w-full px-1 sm:px-0 md:max-w-3xl lg:max-w-[800px]"
    >
      <div className="flex flex-col items-center px-2 text-center max-md:pt-2 sm:px-0">
        <motion.div
          initial={{ opacity: 0, scale: 0.88, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ ...SPRING.gentle, delay: 0.02 }}
          className="mb-4 max-md:mb-3 md:mb-5"
        >
          <VaniOrb state="idle" size={64} glow />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: EASE.smooth, delay: 0.06 }}
          className={cn(
            'mb-3 font-display text-sm font-semibold tracking-[0.22em] text-text-secondary'
          )}
        >
          VANI
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: EASE.smooth, delay: 0.1 }}
          className={cn(
            'type-heading text-foreground',
            'max-md:text-[clamp(1.35rem,5.5vw,1.75rem)] max-md:leading-tight'
          )}
        >
          {greeting}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: EASE.smooth, delay: 0.16 }}
          className="mt-3 max-w-md px-2 text-body font-medium leading-relaxed tracking-[-0.015em] text-text-secondary max-md:mt-2 max-md:text-sm"
        >
          What would you like to work on today?
        </motion.p>
      </div>
    </motion.div>
  );
}
