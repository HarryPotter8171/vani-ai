'use client';

import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Globe2,
  Play,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  browserExecutionPhaseFromRun,
  type BrowserRun,
  type StartBrowserRunInput,
} from '@/lib/browser';
import { safeUrl } from '@/lib/safeUrl';

export interface AutomationWorkspaceProps {
  run: BrowserRun | null;
  isStarting?: boolean;
  error?: string | null;
  onStart: (input: StartBrowserRunInput) => Promise<unknown> | unknown;
  onOpenPanel?: () => void;
  className?: string;
}

function looksLikeUrl(value: string): boolean {
  const u = safeUrl(value.trim());
  return !!u && (u.protocol === 'http:' || u.protocol === 'https:');
}

export default function AutomationWorkspace({
  run,
  isStarting = false,
  error = null,
  onStart,
  onOpenPanel,
  className,
}: AutomationWorkspaceProps) {
  const [goal, setGoal] = useState(run?.goal || '');
  const [url, setUrl] = useState(run?.currentUrl && run.currentUrl !== 'about:blank' ? run.currentUrl : '');
  const [localError, setLocalError] = useState<string | null>(null);

  const phase = browserExecutionPhaseFromRun(run, isStarting);
  const busy = isStarting || run?.status === 'planning' || run?.status === 'running';

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setLocalError(null);

      const trimmedGoal = goal.trim();
      const trimmedUrl = url.trim();

      if (!trimmedGoal && !trimmedUrl) {
        setLocalError('Describe a task or enter a starting URL.');
        return;
      }

      let resolvedUrl = trimmedUrl;
      let resolvedGoal = trimmedGoal;

      if (!resolvedUrl && looksLikeUrl(trimmedGoal)) {
        resolvedUrl = trimmedGoal;
        resolvedGoal = `Open ${trimmedGoal} and complete the requested workflow`;
      }

      if (resolvedUrl && !looksLikeUrl(resolvedUrl)) {
        setLocalError('URL must start with http:// or https://');
        return;
      }

      try {
        await onStart({
          goal: resolvedGoal || (resolvedUrl ? `Open ${resolvedUrl}` : undefined),
          url: resolvedUrl || undefined,
        });
        onOpenPanel?.();
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Unable to start browser automation');
      }
    },
    [goal, url, onStart, onOpenPanel]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE.smooth }}
      className={cn('mx-auto w-full max-w-[560px] py-4', className)}
    >
      <div className="mb-8 flex flex-col items-center text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] bg-accent-muted text-accent">
          <Globe2 size={22} strokeWidth={1.75} />
        </span>
        <h2 className="type-title text-foreground">Browser Automation</h2>
        <p className="mt-2 max-w-[400px] text-sidebar leading-relaxed text-text-secondary">
          Describe a site workflow. VANI launches a real browser session via the Web Agent.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <label className="block">
          <span className="os-section-label mb-2 block px-0.5">Task</span>
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            disabled={busy}
            placeholder="e.g. Open example.com, accept cookies, and extract the pricing table"
            className="rounded-[16px] bg-surface-glass px-3.5 py-3 text-sidebar"
          />
        </label>

        <label className="block">
          <span className="os-section-label mb-2 block px-0.5">Starting URL (optional)</span>
          <div className="relative">
            <Link2
              size={14}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
              placeholder="https://"
              className="bg-surface-glass py-2.5 pl-9 pr-3.5"
            />
          </div>
        </label>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={busy}
          loading={busy}
          leftIcon={busy ? undefined : <Play size={15} strokeWidth={2} />}
          className="w-full shadow-[0_4px_20px_var(--accent-glow)] duration-normal"
        >
          {busy ? phase : 'Start automation'}
        </Button>
      </form>

      {(localError || error) && (
        <ErrorState
          compact
          title="Couldn't start automation"
          message={localError || error || undefined}
          className="mt-3 rounded-[14px] bg-rose-500/[0.07] dark:bg-rose-500/[0.08]"
        />
      )}

      {run || isStarting ? (
        <div className="mt-6 rounded-[16px] border border-border bg-surface-glass/80 px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                Status
              </p>
              <p className="mt-1 text-sidebar font-semibold tracking-[-0.016em] text-foreground">
                {phase}
              </p>
            </div>
            {run && onOpenPanel ? (
              <button
                type="button"
                onClick={onOpenPanel}
                className="rounded-full border border-border px-3 py-1.5 text-caption font-medium text-text-secondary hover:text-foreground"
              >
                Open panel
              </button>
            ) : null}
          </div>
          {run?.goal ? (
            <p className="mt-2 line-clamp-2 text-sm text-text-secondary">{run.goal}</p>
          ) : null}
          {run?.currentUrl && run.currentUrl !== 'about:blank' ? (
            <p className="mt-1 truncate text-micro tabular-nums text-text-tertiary">
              {run.currentUrl}
            </p>
          ) : null}
          {run?.error ? (
            <ErrorState
              compact
              title="Run error"
              message={run.error}
              className="mt-2 px-0 py-2"
            />
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
}
