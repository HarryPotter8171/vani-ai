'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  browserScreenshotUrl,
  fetchBrowserApprovals,
  fetchBrowserRun,
  pauseBrowserRun,
  resolveBrowserApproval,
  resumeBrowserRun,
  startBrowserRun,
  stopBrowserRun,
} from '@/lib/browser';
import type {
  BrowserRun,
  PendingApproval,
  PermissionChoice,
  StartBrowserRunInput,
} from '@/lib/browser';
import { GateDenialError, type GateDenial } from '@/lib/billing/gateError';

const ACTIVE: BrowserRun['status'][] = [
  'awaiting_approval',
  'planning',
  'running',
  'paused',
];

export interface UseBrowserOptions {
  enabled?: boolean;
  pollMs?: number;
  onError?: (message: string) => void;
  onGateDenial?: (denial: GateDenial) => void;
}

export function useBrowser({
  enabled = true,
  pollMs = 1000,
  onError,
  onGateDenial,
}: UseBrowserOptions = {}) {
  const [run, setRun] = useState<BrowserRun | null>(null);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef<string | null>(null);
  const onErrorRef = useRef(onError);
  const onGateDenialRef = useRef(onGateDenial);

  useEffect(() => {
    onErrorRef.current = onError;
    onGateDenialRef.current = onGateDenial;
  }, [onError, onGateDenial]);

  const reportErr = useCallback((err: unknown, fallback: string) => {
    if (err instanceof GateDenialError) {
      onGateDenialRef.current?.(err.denial);
      setError(err.message);
      if (!onGateDenialRef.current) onErrorRef.current?.(err.message);
      return;
    }
    const message = err instanceof Error ? err.message : fallback;
    setError(message);
    onErrorRef.current?.(message);
  }, []);

  const activeApproval =
    run?.pendingApproval ||
    approvals.find((a) => a.runId === run?.runId) ||
    approvals[0] ||
    null;

  const previewUrl =
    run?.latestScreenshotId && run.runId
      ? browserScreenshotUrl(run.runId, run.latestScreenshotId)
      : null;

  const refreshApprovals = useCallback(async () => {
    if (!enabled) return;
    try {
      const next = await fetchBrowserApprovals();
      setApprovals(next);
      if (next.length > 0) setPanelOpen(true);
    } catch {
      // Quiet — backend may be offline during boot.
    }
  }, [enabled]);

  const refreshRun = useCallback(async (runId?: string | null) => {
    const id = runId || runIdRef.current;
    if (!id) return null;
    try {
      const next = await fetchBrowserRun(id);
      setRun(next);
      runIdRef.current = next.runId;
      if (ACTIVE.includes(next.status) || next.pendingApproval) {
        setPanelOpen(true);
      }
      return next;
    } catch (err) {
      reportErr(err, 'Unable to load browser run');
      return null;
    }
  }, [reportErr]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let didInitialProbe = false;

    const shouldPollApprovals = () => {
      if (typeof document !== 'undefined' && document.hidden) return false;
      if (panelOpen) return true;
      if (runIdRef.current) return true;
      return false;
    };

    const tick = async (force = false) => {
      if (!force && !shouldPollApprovals() && approvals.length === 0) {
        return;
      }
      try {
        const next = await fetchBrowserApprovals();
        if (cancelled) return;
        setApprovals((prev) => {
          if (
            prev.length === next.length &&
            prev.every((a, i) => a.approvalId === next[i]?.approvalId)
          ) {
            return prev;
          }
          return next;
        });
        if (next.length > 0) setPanelOpen(true);
      } catch {
        // Quiet — backend may be offline during boot.
      }
    };

    if (!didInitialProbe) {
      didInitialProbe = true;
      void tick(true);
    }

    const timer = setInterval(() => {
      void tick(false);
    }, Math.max(pollMs, runIdRef.current ? 1500 : 8000));

    const onVisibility = () => {
      if (!document.hidden && shouldPollApprovals()) void tick(true);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, pollMs, panelOpen, approvals.length]);

  useEffect(() => {
    if (!enabled) return;
    const runId = run?.runId;
    const status = run?.status;
    if (!runId) return;
    if (status && !ACTIVE.includes(status) && status !== 'awaiting_approval') {
      return;
    }

    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const next = await fetchBrowserRun(runId);
          if (cancelled) return;
          setRun((prev) => {
            if (
              prev &&
              prev.runId === next.runId &&
              prev.status === next.status &&
              prev.latestScreenshotId === next.latestScreenshotId &&
              prev.updatedAt === next.updatedAt &&
              prev.timeline.length === next.timeline.length &&
              prev.pendingApproval?.approvalId === next.pendingApproval?.approvalId &&
              prev.error === next.error
            ) {
              return prev;
            }
            return next;
          });
          runIdRef.current = next.runId;
        } catch {
          // ignore transient poll errors
        }
      })();
    }, pollMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, pollMs, run?.runId, run?.status]);

  const start = useCallback(
    async (input: StartBrowserRunInput) => {
      setIsStarting(true);
      setError(null);
      try {
        const result = await startBrowserRun(input);
        runIdRef.current = result.runId;
        setRun(result.snapshot);
        setPanelOpen(true);
        if (result.approval) {
          setApprovals((prev) => {
            const rest = prev.filter((a) => a.approvalId !== result.approval!.approvalId);
            return [result.approval!, ...rest];
          });
        }
        void refreshRun(result.runId);
        return result;
      } catch (err) {
        reportErr(err, 'Unable to start browser');
        throw err;
      } finally {
        setIsStarting(false);
      }
    },
    [refreshRun, reportErr]
  );

  const pause = useCallback(async () => {
    if (!runIdRef.current) return;
    const next = await pauseBrowserRun(runIdRef.current);
    setRun(next);
  }, []);

  const resume = useCallback(async () => {
    if (!runIdRef.current) return;
    const next = await resumeBrowserRun(runIdRef.current);
    setRun(next);
  }, []);

  const stop = useCallback(async () => {
    if (!runIdRef.current) return;
    const next = await stopBrowserRun(runIdRef.current);
    setRun(next);
  }, []);

  const resolveApproval = useCallback(
    async (choice: PermissionChoice, approvalId?: string) => {
      const id = approvalId || activeApproval?.approvalId;
      if (!id) return;
      await resolveBrowserApproval(id, choice);
      setApprovals((prev) => prev.filter((a) => a.approvalId !== id));
      if (runIdRef.current) {
        setTimeout(() => void refreshRun(), 300);
        setTimeout(() => void refreshRun(), 1200);
      }
      void refreshApprovals();
    },
    [activeApproval?.approvalId, refreshApprovals, refreshRun]
  );

  const attachRun = useCallback(
    (runId: string) => {
      runIdRef.current = runId;
      setPanelOpen(true);
      void refreshRun(runId);
    },
    [refreshRun]
  );

  const isActive = Boolean(run && ACTIVE.includes(run.status));

  return {
    run,
    approvals,
    activeApproval,
    previewUrl,
    panelOpen,
    setPanelOpen,
    isStarting,
    isActive,
    error,
    start,
    pause,
    resume,
    stop,
    resolveApproval,
    refreshRun,
    refreshApprovals,
    attachRun,
  };
}
