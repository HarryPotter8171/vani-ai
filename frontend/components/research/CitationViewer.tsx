'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookMarked, ExternalLink, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING, MENU_MOTION } from '@/lib/motion';
import type { ResearchCitation } from '@/lib/research';

export interface CitationViewerProps {
  citations: ResearchCitation[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export default function CitationViewer({
  citations,
  open: openProp,
  onOpenChange,
  className,
}: CitationViewerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (openProp === undefined) setInternalOpen(v);
  };

  if (!citations.length) return null;

  return (
    <div className={cn('relative', className)}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5',
          'text-caption font-medium tracking-[-0.01em]',
          'text-muted-foreground transition-all duration-normal ease-apple',
          'hover:bg-surface-hover hover:text-foreground hover:shadow-1',
          open && 'bg-accent-muted text-accent shadow-1'
        )}
        aria-expanded={open}
      >
        <BookMarked size={13} strokeWidth={2} />
        Citations
        <span
          className={cn(
            'ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1',
            'text-micro font-bold tabular-nums',
            open ? 'bg-accent text-text-on-accent' : 'bg-surface-hover text-text-secondary'
          )}
        >
          {citations.length}
        </span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            {...MENU_MOTION}
            className={cn(
              'absolute bottom-full left-0 z-30 mb-2 w-[min(380px,calc(100vw-2rem))]',
              'overflow-hidden rounded-[18px]',
              'border border-border menu-surface'
            )}
          >
            <div className="flex items-center justify-between border-b border-divider px-3.5 py-2.5">
              <p className="text-sm font-semibold tracking-[-0.01em]">Sources</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-surface-hover"
                aria-label="Close citations"
              >
                <X size={14} />
              </button>
            </div>
            <ul className="custom-scrollbar max-h-72 overflow-y-auto p-1.5">
              {citations.map((c, i) => (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING.soft, delay: i * 0.03 }}
                >
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'group flex gap-2.5 rounded-[14px] px-2.5 py-2.5',
                      'hover:bg-surface-hover hover-elevate'
                    )}
                  >
                    <span className="citation-chip mt-0.5 shrink-0 !m-0 !align-middle">
                      {c.label?.replace(/[\[\]]/g, '') || i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-1.5">
                        <span className="line-clamp-2 text-sm font-medium tracking-[-0.01em] text-foreground">
                          {c.title}
                        </span>
                        <ExternalLink
                          size={11}
                          className="mt-0.5 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
 />
                      </span>
                      {c.snippet ? (
                        <span className="mt-0.5 line-clamp-2 block text-micro leading-[1.4] text-muted-foreground/75">
                          {c.snippet}
                        </span>
                      ) : null}
                      <span className="mt-1 block truncate text-micro text-accent/80">
                        {c.hostname || c.url}
                      </span>
                    </span>
                  </a>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
