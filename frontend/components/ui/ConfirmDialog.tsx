'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, SPRING } from '@/lib/motion';
import { Button } from '@/components/ui/Button';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' renders a red warning icon + red confirm button (destructive actions). */
  variant?: 'danger' | 'default';
}

interface ConfirmState extends ConfirmOptions {
  id: string;
}

/** Promise-based: resolves `true` on confirm, `false` on cancel/dismiss. */
type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * App-wide confirmation dialog — mirrors ToastProvider's context+hook shape.
 * Only one dialog can be open at a time; a second `confirm()` call while one
 * is pending resolves the earlier call as `false` before showing the new one.
 */
export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState(null);
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ id: `confirm-${Date.now()}`, ...options });
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [state, settle]);

  useEffect(() => {
    if (!state) return;
    const t = window.setTimeout(() => confirmBtnRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [state]);

  const isDanger = state?.variant === 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <AnimatePresence>
        {state && (
          <div key={state.id} className="fixed inset-0 z-[200]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE.apple }}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              onClick={() => settle(false)}
              aria-hidden
            />
            <div className="relative flex h-full w-full items-center justify-center px-5">
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.97 }}
                transition={SPRING.soft}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={`${state.id}-title`}
                aria-describedby={
                  state.description ? `${state.id}-description` : undefined
                }
                className={cn(
                  'w-full max-w-[420px] overflow-hidden rounded-[20px] px-7 pb-6 pt-7',
                  'border border-white/20 dark:border-white/[0.1]',
                  'bg-white/78 dark:bg-[#1c1c1e]/82',
                  'backdrop-blur-[40px] backdrop-saturate-[180%]',
                  'shadow-[0_24px_80px_rgba(0,0,0,0.28),0_0_0_0.5px_rgba(0,0,0,0.06)]',
                  'dark:shadow-[0_28px_90px_rgba(0,0,0,0.55),0_0_0_0.5px_rgba(255,255,255,0.06)]'
                )}
              >
                <div className="flex flex-col items-center text-center">
                  <div
                    className={cn(
                      'mb-5 flex h-14 w-14 items-center justify-center rounded-full',
                      isDanger
                        ? 'bg-red-500/12 text-red-500 dark:bg-red-500/18 dark:text-red-400'
                        : 'bg-accent-muted text-accent'
                    )}
                  >
                    <AlertTriangle size={28} strokeWidth={1.75} />
                  </div>

                  <h2
                    id={`${state.id}-title`}
                    className="type-title text-foreground"
                  >
                    {state.title}
                  </h2>

                  {state.description ? (
                    <p
                      id={`${state.id}-description`}
                      className="mt-2.5 max-w-[320px] text-sidebar leading-[1.55] tracking-[-0.011em] text-text-secondary whitespace-pre-line"
                    >
                      {state.description}
                    </p>
                  ) : null}
                </div>

                <div className="mt-7 flex gap-2.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="dialog"
                    onClick={() => settle(false)}
                    className={cn(
                      'flex-1 bg-black/[0.06] text-foreground',
                      'dark:bg-white/[0.1]',
                      'hover:bg-black/[0.1] dark:hover:bg-white/[0.14]',
                      'duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]'
                    )}
                  >
                    {state.cancelLabel || 'Cancel'}
                  </Button>
                  <Button
                    ref={confirmBtnRef}
                    type="button"
                    variant={isDanger ? 'destructive' : 'primary'}
                    size="dialog"
                    onClick={() => settle(true)}
                    className="flex-1 shadow-[0_6px_20px_var(--accent-glow)] hover:shadow-[0_8px_28px_var(--accent-glow)] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
                  >
                    {state.confirmLabel || 'Confirm'}
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider');
  }
  return ctx;
}
