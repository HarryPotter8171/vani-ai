'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, SPRING } from '@/lib/motion';
import { Button } from '@/components/ui/Button';
import type { GateDenial } from '@/lib/billing/gateError';

export interface UpgradePlanModalProps {
  open: boolean;
  denial: GateDenial | null;
  onClose: () => void;
  onUpgrade: () => void;
}

/**
 * Production upgrade prompt for PLAN_REQUIRED denials (agents, browser, …).
 * Replaces transient error toasts with a clear, actionable modal.
 */
export default function UpgradePlanModal({
  open,
  denial,
  onClose,
  onUpgrade,
}: UpgradePlanModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const planLabel = denial?.requiredPlan
    ? denial.requiredPlan.charAt(0).toUpperCase() + denial.requiredPlan.slice(1)
    : 'Pro';
  const featureLabel = denial?.feature
    ? denial.feature.replace(/_/g, ' ')
    : 'this feature';

  const title = `${planLabel} plan required`;
  const description =
    denial?.message ||
    `${featureLabel.charAt(0).toUpperCase() + featureLabel.slice(1)} needs the ${planLabel} plan or higher. Upgrade to unlock it.`;

  return createPortal(
    <AnimatePresence>
      {open && denial ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center sm:p-5">
          <motion.button
            type="button"
            aria-label="Dismiss"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE.apple }}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-plan-title"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={SPRING.snappy}
            className={cn(
              'relative z-[1] w-full overflow-hidden',
              'rounded-t-[22px] border border-border/70 border-b-0 bg-surface-elevated shadow-3',
              'sm:max-w-[400px] sm:rounded-[22px] sm:border-b',
              'pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-5'
            )}
          >
            <div className="flex justify-center pt-3 sm:hidden" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-foreground/15" />
            </div>

            <div className="flex items-start justify-between gap-3 px-5 pt-4 sm:pt-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-accent-muted text-accent">
                <Sparkles size={20} strokeWidth={1.75} />
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-hover hover:text-foreground touch-manipulation"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pt-3 pb-5">
              <h2
                id="upgrade-plan-title"
                className="text-lg font-semibold tracking-[-0.024em] text-foreground"
              >
                {title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed tracking-[-0.01em] text-text-secondary">
                {description}
              </p>
              {denial.upgradeHint ? (
                <p className="mt-2 text-caption text-text-tertiary">{denial.upgradeHint}</p>
              ) : null}

              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse">
                <Button
                  type="button"
                  className="h-12 w-full touch-manipulation sm:h-11 sm:flex-1"
                  onClick={onUpgrade}
                >
                  View plans
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-12 w-full touch-manipulation sm:h-11 sm:flex-1"
                  onClick={onClose}
                >
                  Not now
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
