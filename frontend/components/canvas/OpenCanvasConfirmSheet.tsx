'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, SPRING } from '@/lib/motion';

export interface OpenCanvasConfirmSheetProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Optional preview title shown under the heading. */
  title?: string;
}

/**
 * Mobile-only confirmation before entering full-screen Canvas.
 * Desktop opens Canvas directly — this sheet is never shown there.
 */
export default function OpenCanvasConfirmSheet({
  open,
  onCancel,
  onConfirm,
  title,
}: OpenCanvasConfirmSheetProps) {
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!portalReady) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[290] md:hidden" role="presentation">
          <motion.button
            type="button"
            aria-label="Dismiss"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE.apple }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={onCancel}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="open-canvas-title"
            aria-describedby="open-canvas-desc"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SPRING.snappy}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 72 || info.velocity.y > 500) onCancel();
            }}
            className={cn(
              'absolute inset-x-0 bottom-0',
              'rounded-t-[22px] border border-border/70 border-b-0',
              'bg-surface-elevated shadow-[0_-8px_40px_rgba(0,0,0,0.28)]',
              'pb-[max(1rem,env(safe-area-inset-bottom,0px))]'
            )}
          >
            <div className="flex justify-center pt-3 pb-1" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-foreground/15" />
            </div>

            <div className="flex flex-col items-center px-6 pb-2 pt-3 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-muted text-accent">
                <PanelRight size={22} strokeWidth={1.75} />
              </div>
              <h2
                id="open-canvas-title"
                className="text-body font-semibold tracking-[-0.02em] text-foreground"
              >
                Open this response in Canvas?
              </h2>
              <p
                id="open-canvas-desc"
                className="mt-1.5 max-w-[280px] text-sm leading-relaxed text-text-secondary"
              >
                Continue editing with the full editor.
              </p>
              {title ? (
                <p className="mt-2 max-w-full truncate text-micro text-muted-foreground">
                  {title}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 px-4 pt-3">
              <button
                type="button"
                onClick={onConfirm}
                className={cn(
                  'flex min-h-12 w-full items-center justify-center rounded-full',
                  'bg-accent px-4 text-body font-semibold tracking-[-0.016em] text-text-on-accent',
                  'active:scale-[0.985] transition-transform touch-manipulation'
                )}
              >
                Open Canvas
              </button>
              <button
                type="button"
                onClick={onCancel}
                className={cn(
                  'flex min-h-12 w-full items-center justify-center rounded-full',
                  'bg-surface-hover px-4 text-body font-semibold tracking-[-0.016em] text-foreground',
                  'active:scale-[0.985] transition-transform touch-manipulation'
                )}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
