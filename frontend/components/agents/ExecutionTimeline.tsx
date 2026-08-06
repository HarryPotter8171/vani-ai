'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Circle, RotateCcw, Square, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import type { AgentPlanStep } from '@/lib/agents';
import type { ExecutorState } from '@/lib/agents/Executor';

export interface ExecutionTimelineProps {
  executor: ExecutorState;
  isRunning: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCancel?: () => void;
  onRetry?: () => void;
  className?: string;
}

function StepIcon({ status }: { status: AgentPlanStep['status'] }) {
  if (status === 'completed') {
    return <Check size={12} strokeWidth={2.25} className="text-emerald-600 dark:text-emerald-400" />;
  }
  if (status === 'failed') {
    return <X size={12} strokeWidth={2.25} className="text-rose-500" />;
  }
  if (status === 'running') {
    return <Spinner size={12} strokeWidth={2} className="text-accent" />;
  }
  return <Circle size={10} strokeWidth={1.75} className="text-muted-foreground/45" />;
}

export default function ExecutionTimeline({
  executor,
  isRunning,
  open: openProp,
  onOpenChange,
  onCancel,
  onRetry,
  className }: ExecutionTimelineProps) {
  const [internalOpen, setInternalOpen] = useState(true);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (openProp === undefined) setInternalOpen(v);
  };

  const steps = executor.steps;
  const show = isRunning || steps.length > 0 || executor.progress > 0;
  if (!show) return null;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[20px]',
        'border border-black/[0.05] dark:border-white/[0.07]',
        'bg-white/55 dark:bg-white/[0.035]',
        'backdrop-blur-xl',
        'shadow-[0_4px_20px_rgba(0,0,0,0.04),inset_0_0.5px_0_rgba(255,255,255,0.55)]',
        'dark:shadow-[0_8px_28px_rgba(0,0,0,0.25),inset_0_0.5px_0_rgba(255,255,255,0.04)]',
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            size={14}
            className={cn(
              'shrink-0 text-muted-foreground/70 transition-transform duration-200',
              !open && '-rotate-90'
            )}
 />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium tracking-[-0.01em]">
              {executor.currentLabel || 'Execution'}
            </p>
            <p className="text-micro tabular-nums text-muted-foreground/70">
              {executor.progress}% complete
              {steps.length ? ` · ${steps.filter((s) => s.status === 'completed').length}/${steps.length} steps` : ''}
            </p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {executor.canRetry && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-full px-2.5',
                'text-micro font-medium text-foreground/80',
                'hover:bg-foreground/[0.05] dark:hover:bg-white/[0.06]'
              )}
              aria-label="Retry failed step"
            >
              <RotateCcw size={12} strokeWidth={1.75} />
              Retry
            </button>
          )}
          {executor.canCancel && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-full px-2.5',
                'text-micro font-medium text-rose-600/90 dark:text-rose-400',
                'hover:bg-rose-500/10'
              )}
              aria-label="Cancel agent execution"
            >
              <Square size={11} strokeWidth={2} />
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="mx-3 mb-2 h-[3px] overflow-hidden rounded-full bg-foreground/[0.06] dark:bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
          style={{ width: `${Math.max(0, Math.min(100, executor.progress))}%` }}
 />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <ol className="space-y-0.5 px-2 pb-2.5">
              {steps.length === 0 && isRunning && (
                <li className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm text-muted-foreground">
                  <Spinner size={12} className="text-accent" />
                  Planning...
                </li>
              )}
              {steps.map((step, index) => (
                <li key={step.id || index}>
                  <details
                    className={cn(
                      'group rounded-xl px-2 py-1.5',
                      'open:bg-foreground/[0.03] dark:open:bg-white/[0.03]'
                    )}
                    open={step.status === 'running' || step.status === 'failed'}
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2.5">
                      <span
                        className={cn(
                          'inline-flex h-5 w-5 items-center justify-center rounded-full',
                          step.status === 'completed' && 'bg-emerald-500/10',
                          step.status === 'failed' && 'bg-rose-500/10',
                          step.status === 'running' && 'bg-accent-muted',
                          step.status === 'pending' && 'bg-foreground/[0.04]'
                        )}
                      >
                        <StepIcon status={step.status} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-[-0.01em]">
                        {step.title}
                      </span>
                      {step.tool && (
                        <span className="shrink-0 text-micro uppercase tracking-[0.06em] text-muted-foreground/55">
                          {step.tool}
                        </span>
                      )}
                    </summary>
                    {(step.description || step.error) && (
                      <div className="ml-7 mt-1 space-y-1 pb-0.5">
                        {step.description && (
                          <p className="text-caption leading-relaxed text-muted-foreground/80">
                            {step.description}
                          </p>
                        )}
                        {step.error && (
                          <p className="text-caption leading-relaxed text-rose-500/90">
                            {step.error}
                          </p>
                        )}
                      </div>
                    )}
                  </details>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
