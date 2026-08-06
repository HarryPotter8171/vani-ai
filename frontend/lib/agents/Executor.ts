/**
 * Client Executor — tracks step execution state from the SSE stream.
 */

import type { AgentPlanStep, AgentStreamEvent } from './types';

export interface ExecutorState {
  steps: AgentPlanStep[];
  progress: number;
  currentLabel: string;
  canCancel: boolean;
  canRetry: boolean;
  failedStepIndex: number | null;
}

export function createExecutorState(): ExecutorState {
  return {
    steps: [],
    progress: 0,
    currentLabel: 'Ready',
    canCancel: false,
    canRetry: false,
    failedStepIndex: null,
  };
}

export function reduceExecutorState(
  state: ExecutorState,
  event: AgentStreamEvent
): ExecutorState {
  const next: ExecutorState = {
    ...state,
    steps: state.steps.map((s) => ({ ...s })),
  };

  if (typeof event.progress === 'number') {
    next.progress = event.progress;
  }

  switch (event.type) {
    case 'session_start':
    case 'status':
      next.canCancel = true;
      next.canRetry = false;
      if (event.status === 'planning' || event.type === 'session_start') {
        next.currentLabel = 'Planning...';
      }
      break;
    case 'plan':
      next.steps = (event.plan || []).map((s) => ({ ...s }));
      next.currentLabel = 'Executing...';
      next.canCancel = true;
      break;
    case 'step_start':
      if (event.step) {
        next.steps = upsert(next.steps, event.step);
        next.currentLabel = event.step.title || 'Executing...';
      }
      next.canCancel = true;
      break;
    case 'step_done':
      if (event.step) next.steps = upsert(next.steps, event.step);
      break;
    case 'step_failed':
      if (event.step) {
        next.steps = upsert(next.steps, event.step);
        next.failedStepIndex =
          typeof event.step.index === 'number'
            ? event.step.index
            : next.steps.findIndex((s) => s.id === event.step?.id);
        next.canRetry = true;
        next.currentLabel = 'Step failed';
      }
      break;
    case 'tool_start':
      next.currentLabel = event.displayName
        ? /\.\.\.$/.test(event.displayName)
          ? event.displayName
          : `${event.displayName}...`
        : next.currentLabel;
      next.canCancel = true;
      break;
    case 'retry':
      next.currentLabel = 'Retrying...';
      next.canCancel = true;
      break;
    case 'delta':
      next.currentLabel = 'Generating answer...';
      next.canCancel = true;
      break;
    case 'completed':
    case 'done':
      next.progress = 100;
      next.currentLabel = 'Completed';
      next.canCancel = false;
      next.canRetry = false;
      if (event.steps) next.steps = event.steps;
      break;
    case 'cancelled':
      next.currentLabel = 'Cancelled';
      next.canCancel = false;
      next.canRetry = true;
      break;
    case 'error':
      next.currentLabel = 'Failed';
      next.canCancel = false;
      next.canRetry = true;
      break;
    case 'paused':
      next.currentLabel = 'Paused';
      next.canCancel = true;
      break;
    case 'resumed':
      next.currentLabel = 'Executing...';
      next.canCancel = true;
      break;
    default:
      break;
  }

  return next;
}

function upsert(steps: AgentPlanStep[], step: AgentPlanStep): AgentPlanStep[] {
  const idx = steps.findIndex((s) => s.id === step.id);
  if (idx === -1) return [...steps, step];
  const copy = [...steps];
  copy[idx] = { ...copy[idx], ...step };
  return copy;
}

export class Executor {
  createState = createExecutorState;
  reduce = reduceExecutorState;
}

export const executor = new Executor();
