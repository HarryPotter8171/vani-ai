'use client';

import React from 'react';
import { Pause, XCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import type { AgentTypeInfo } from '@/lib/agents';
import type { ExecutorState } from '@/lib/agents/Executor';

export interface AgentStatusProps {
  agent: AgentTypeInfo | null;
  executor: ExecutorState;
  isRunning: boolean;
  className?: string;
}

export default function AgentStatus({
  agent,
  executor,
  isRunning,
  className,
}: AgentStatusProps) {
  if (!agent && !isRunning && executor.progress === 0) return null;

  const label = executor.currentLabel || (isRunning ? 'Working...' : 'Ready');
  const pct = Math.max(0, Math.min(100, executor.progress));

  const StatusIcon =
    label === 'Completed'
      ? CheckCircle2
      : label === 'Failed' || label === 'Cancelled'
        ? label === 'Failed'
          ? AlertCircle
          : XCircle
        : label === 'Paused'
          ? Pause
          : Spinner;

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-full px-3 py-1.5',
        'bg-white/50 dark:bg-white/[0.04]',
        'backdrop-blur-xl border border-black/[0.04] dark:border-white/[0.06]',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <StatusIcon
        size={14}
        strokeWidth={1.75}
        className={cn(
          label === 'Completed' && 'text-emerald-600 dark:text-emerald-400',
          (label === 'Failed' || label === 'Cancelled') && 'text-rose-500',
          (isRunning || StatusIcon === Spinner) && label !== 'Completed' && 'text-accent',
          !isRunning && label === 'Paused' && 'text-amber-500'
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium tracking-[-0.01em] text-foreground/90">
            {agent ? `${agent.name} · ${label}` : label}
          </p>
          <span className="shrink-0 tabular-nums text-micro text-muted-foreground/75">
            {pct}%
          </span>
        </div>
        <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-foreground/[0.06] dark:bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-apple"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
