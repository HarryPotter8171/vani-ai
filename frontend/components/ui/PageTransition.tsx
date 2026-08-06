'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PAGE_TRANSITION } from '@/lib/motion';

export interface PageTransitionProps {
  children: React.ReactNode;
  /** Unique key for view identity */
  viewKey: string;
  className?: string;
}

/**
 * Soft spring page / view transition wrapper for chat ↔ empty ↔ panels.
 * Pair with a parent `<AnimatePresence mode="wait">`.
 */
export function PageTransition({ children, viewKey, className }: PageTransitionProps) {
  return (
    <motion.div
      key={viewKey}
      initial={PAGE_TRANSITION.initial}
      animate={PAGE_TRANSITION.animate}
      exit={PAGE_TRANSITION.exit}
      transition={PAGE_TRANSITION.transition}
      className={cn('h-full w-full', className)}
    >
      {children}
    </motion.div>
  );
}

/** Hover elevation wrapper for interactive cards / rows */
export function HoverElevate({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('hover-elevate', className)}>{children}</div>;
}

export default PageTransition;
