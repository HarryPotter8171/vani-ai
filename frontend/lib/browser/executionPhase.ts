import type { BrowserRun, BrowserRunStatus } from './types';

/** User-facing execution phases for the Automation workspace / BrowserPanel. */
export type BrowserExecutionPhase =
  | 'Preparing'
  | 'Launching browser'
  | 'Running'
  | 'Waiting for approval'
  | 'Paused'
  | 'Completed'
  | 'Failed'
  | 'Stopped'
  | 'Ready';

export function browserExecutionPhase(
  status: BrowserRunStatus | null | undefined,
  options: { isStarting?: boolean } = {}
): BrowserExecutionPhase {
  if (options.isStarting) return 'Preparing';
  switch (status) {
    case 'awaiting_approval':
      return 'Waiting for approval';
    case 'planning':
      return 'Launching browser';
    case 'running':
      return 'Running';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Stopped';
    case 'idle':
    default:
      return 'Ready';
  }
}

export function browserExecutionPhaseFromRun(
  run: BrowserRun | null | undefined,
  isStarting = false
): BrowserExecutionPhase {
  return browserExecutionPhase(run?.status, { isStarting });
}
