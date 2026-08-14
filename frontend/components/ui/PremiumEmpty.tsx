'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING, EASE } from '@/lib/motion';

export interface PremiumEmptyProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Compact for sidebars / panels */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Reusable premium empty state — soft icon halo, spring entrance, one CTA slot.
 */
export function PremiumEmpty({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = 'md',
}: PremiumEmptyProps) {
  const pad = size === 'sm' ? 'py-8 px-4' : size === 'lg' ? 'py-16 px-8' : 'py-12 px-6';
  const iconBox =
    size === 'sm' ? 'h-11 w-11' : size === 'lg' ? 'h-16 w-16' : 'h-14 w-14';
  const iconSize = size === 'sm' ? 18 : size === 'lg' ? 26 : 22;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE.smooth }}
      className={cn(
        'flex w-full flex-col items-center justify-center text-center',
        pad,
        className
      )}
    >
      {Icon ? (
        <motion.div
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING.soft}
          className={cn(
            'mb-4 flex items-center justify-center rounded-[20px]',
            iconBox,
            'bg-accent-muted text-accent',
            'shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_12%,transparent)]',
            'ring-8 ring-accent/[0.04]'
          )}
        >
          <Icon size={iconSize} strokeWidth={1.75} />
        </motion.div>
      ) : null}

      <h3
        className={cn(
          'font-semibold tracking-[-0.022em] text-foreground',
          size === 'sm' ? 'text-sidebar' : 'text-assistant'
        )}
      >
        {title}
      </h3>

      {description ? (
        <p
          className={cn(
            'mt-1.5 max-w-[280px] text-sm leading-[1.45] text-text-secondary'
          )}
        >
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-5">{action}</div> : null}
    </motion.div>
  );
}

export default PremiumEmpty;
