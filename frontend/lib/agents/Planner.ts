/**
 * Client Planner helpers — progress labels and plan presentation.
 * Server-side planning (Gemini task breakdown) lives in backend/agents/Planner.js.
 */

import type { AgentPlanStep, AgentTypeId } from './types';
import { DEFAULT_PROGRESS_LABELS } from './types';

export interface ClientPlanPreview {
  goal: string;
  labels: string[];
  steps: AgentPlanStep[];
}

/** Map agent type → suggested progress narrative for empty/loading UI. */
export function suggestedProgressLabels(agentType: AgentTypeId): string[] {
  switch (agentType) {
    case 'research':
      return [
        'Planning...',
        'Searching...',
        'Reading sources...',
        'Analyzing...',
        'Generating answer...',
        'Completed',
      ];
    case 'coding':
      return [
        'Planning...',
        'Inspecting code...',
        'Analyzing...',
        'Generating answer...',
        'Completed',
      ];
    case 'writing':
      return ['Planning...', 'Drafting...', 'Refining...', 'Generating answer...', 'Completed'];
    case 'data_analysis':
      return [
        'Planning...',
        'Loading data...',
        'Calculating...',
        'Analyzing...',
        'Generating answer...',
        'Completed',
      ];
    case 'web':
      return [
        'Planning...',
        'Searching...',
        'Checking live data...',
        'Generating answer...',
        'Completed',
      ];
    default:
      return [...DEFAULT_PROGRESS_LABELS];
  }
}

export function activeStepLabel(steps: AgentPlanStep[], status: string): string {
  if (status === 'planning') return 'Planning...';
  if (status === 'verifying') return 'Verifying results...';
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'failed') return 'Failed';
  if (status === 'paused') return 'Paused';

  const running = steps.find((s) => s.status === 'running');
  if (running?.title) return running.title;

  const lastDone = [...steps].reverse().find((s) => s.status === 'completed');
  if (lastDone && steps.every((s) => s.status === 'completed')) {
    return 'Generating answer...';
  }

  return lastDone?.title || 'Executing...';
}

export class Planner {
  suggestedLabels = suggestedProgressLabels;
  activeLabel = activeStepLabel;
}

export const planner = new Planner();
