'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Skeleton, SkeletonAvatar } from '@/components/ui/Skeleton';

/** One shimmering bubble, alternating user/assistant alignment and width. */
function SkeletonBubble({
  align,
  width,
}: {
  align: 'left' | 'right';
  width: string;
}) {
  if (align === 'right') {
    return (
      <div className="flex w-full justify-end px-1 py-2 md:px-0">
        <Skeleton
          className={cn('h-[44px] max-md:h-[48px]', width)}
          rounded="lg"
        />
      </div>
    );
  }

  return (
    <div className="flex w-full items-start gap-2.5 px-1 py-2 md:gap-3 md:px-0">
      <SkeletonAvatar size={28} className="mt-1 shrink-0 max-md:h-7 max-md:w-7" />
      <Skeleton
        className={cn('h-[56px] max-md:h-[64px] flex-1', width)}
        rounded="lg"
      />
    </div>
  );
}

/**
 * Shown in the message pane while a past conversation's full history is
 * being fetched — premium staggered shimmer that mirrors real chat rhythm.
 */
export default function ConversationSkeleton() {
  return (
    <motion.div
      key="conversation-skeleton"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="flex flex-col pt-2 max-md:pt-4"
      aria-busy="true"
      aria-label="Loading conversation"
    >
      {[
        { align: 'right' as const, width: 'w-[45%] max-md:w-[72%]', delay: 0 },
        { align: 'left' as const, width: 'w-[70%] max-md:w-full', delay: 0.05 },
        { align: 'right' as const, width: 'w-[30%] max-md:w-[48%]', delay: 0.1 },
        { align: 'left' as const, width: 'w-[85%] max-md:w-full', delay: 0.15 },
        { align: 'left' as const, width: 'w-[55%] max-md:w-[78%]', delay: 0.2 },
      ].map((row, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: row.delay, ease: [0.16, 1, 0.3, 1] }}
          className="will-change-transform"
        >
          <SkeletonBubble align={row.align} width={row.width} />
        </motion.div>
      ))}
    </motion.div>
  );
}
