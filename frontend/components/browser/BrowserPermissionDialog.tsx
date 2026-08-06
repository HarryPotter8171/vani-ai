'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Globe2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import type { PendingApproval, PermissionChoice } from '@/lib/browser';

export interface BrowserPermissionDialogProps {
  approval: PendingApproval | null;
  busy?: boolean;
  onResolve: (choice: PermissionChoice) => void;
}

export default function BrowserPermissionDialog({
  approval,
  busy = false,
  onResolve,
}: BrowserPermissionDialogProps) {
  return (
    <AnimatePresence>
      {approval && (
        <div className="fixed inset-0 z-[120]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 modal-overlay"
 />
          <div className="relative flex h-full w-full items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              className={cn(
                'w-full max-w-[440px] overflow-hidden rounded-[24px]',
                'border border-border',
                'bg-surface',
                'backdrop-blur-2xl',
                'shadow-[0_24px_80px_rgba(0,0,0,0.22),inset_0_0.5px_0_rgba(255,255,255,0.55)]',
                'dark:shadow-[0_24px_80px_rgba(0,0,0,0.55),inset_0_0.5px_0_rgba(255,255,255,0.06)]'
              )}
              role="dialog"
              aria-modal="true"
              aria-labelledby="browser-permission-title"
            >
              <div className="px-5 pb-5 pt-5">
                <div className="mb-4 flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
                      approval.dangerousSteps.length
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'bg-accent-muted text-accent'
                    )}
                  >
                    {approval.dangerousSteps.length ? (
                      <AlertTriangle size={18} strokeWidth={1.75} />
                    ) : (
                      <Shield size={18} strokeWidth={1.75} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2
                      id="browser-permission-title"
                      className="text-assistant font-semibold tracking-[-0.02em]"
                    >
                      Allow browser automation?
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      VANI planned actions on this site. Approve before anything runs.
                    </p>
                  </div>
                </div>

                <div
                  className={cn(
                    'mb-3 flex items-center gap-2 rounded-2xl px-3 py-2.5',
                    'bg-foreground/[0.03] dark:bg-white/[0.04]'
                  )}
                >
                  <Globe2 size={14} className="shrink-0 text-muted-foreground/70" />
                  <p className="truncate text-sm font-medium tracking-[-0.01em]">
                    {approval.origin}
                  </p>
                </div>

                <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">
                  {approval.goal}
                </p>

                <ul className="mb-4 max-h-[160px] space-y-1.5 overflow-y-auto pr-1">
                  {approval.steps.slice(0, 12).map((step) => (
                    <li
                      key={step.id}
                      className={cn(
                        'rounded-xl px-2.5 py-1.5 text-caption',
                        step.dangerous
                          ? 'bg-rose-500/[0.07] text-rose-700 dark:text-rose-300'
                          : 'bg-foreground/[0.025] text-foreground/75 dark:bg-white/[0.03]'
                      )}
                    >
                      <span className="font-medium">{step.label}</span>
                      {step.dangerReason ? (
                        <span className="mt-0.5 block text-micro opacity-80">
                          {step.dangerReason}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>

                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    disabled={busy}
                    onClick={() => onResolve('allow_once')}
                    className="h-10 w-full shadow-none hover:opacity-90 hover:shadow-none"
                  >
                    Allow once
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    disabled={busy}
                    onClick={() => onResolve('always_allow')}
                    className={cn(
                      'h-10 w-full text-foreground/85',
                      'bg-foreground/[0.05] dark:bg-white/[0.06]',
                      'hover:bg-foreground/[0.08] hover:text-foreground/85'
                    )}
                  >
                    Always allow for this site
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    disabled={busy}
                    onClick={() => onResolve('deny')}
                    className="h-10 w-full text-rose-600 hover:bg-rose-500/[0.06] hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-400"
                  >
                    Deny
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
