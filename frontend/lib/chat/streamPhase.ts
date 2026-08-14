import type { StreamPhase } from '@/lib/types';

export const STREAM_PHASE_LABELS: Record<StreamPhase, string> = {
  thinking: 'Thinking…',
  searching: 'Searching…',
  writing: 'Writing…',
  using_tools: 'Using tools…',
  finished: 'Finished',
};

/** Map tool display names / ids to a safe user-facing phase. */
export function phaseFromToolHint(hint?: string | null): StreamPhase {
  const s = String(hint || '').toLowerCase();
  if (!s) return 'using_tools';
  if (
    /search|web|browse|research|lookup|google|bing|tavily|serp|memory/.test(s)
  ) {
    return 'searching';
  }
  return 'using_tools';
}

export function labelForPhase(phase: StreamPhase | null | undefined): string {
  if (!phase) return STREAM_PHASE_LABELS.thinking;
  return STREAM_PHASE_LABELS[phase] ?? STREAM_PHASE_LABELS.thinking;
}
