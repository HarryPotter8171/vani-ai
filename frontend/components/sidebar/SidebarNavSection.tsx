'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion';

export interface SidebarNavSectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  trailing?: React.ReactNode;
}

/**
 * Collapsible premium sidebar section with animated chevron.
 */
export default function SidebarNavSection({
  id,
  title,
  children,
  defaultOpen = true,
  className,
  trailing,
}: SidebarNavSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `sidebar-section-${id}`;

  return (
    <div className={cn('mt-1', className)}>
      <div className="flex items-center gap-1 px-1">
        <button
          type="button"
          className="sidebar-section-trigger flex-1"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="os-section-label px-0">{title}</span>
          <motion.span
            animate={{ rotate: open ? 0 : -90 }}
            transition={SPRING.snappy}
            className="text-text-tertiary"
          >
            <ChevronDown size={13} strokeWidth={2} />
          </motion.span>
        </button>
        {trailing}
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 pb-1 pt-0.5">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
