/** Shared agent domain types for VANI AI. */

export type AgentTypeId =
  | 'general'
  | 'coding'
  | 'research'
  | 'writing'
  | 'data_analysis'
  | 'web';

export type AgentSessionStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'paused'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentTypeInfo {
  id: AgentTypeId;
  name: string;
  description: string;
  tools: string[];
}

export interface AgentPlanStep {
  id: string;
  index?: number;
  title: string;
  description?: string;
  tool?: string | null;
  args?: Record<string, unknown>;
  parallelGroup?: number | null;
  status: AgentStepStatus;
  retries?: number;
  result?: unknown;
  error?: string | null;
  startedAt?: number;
  finishedAt?: number;
}

export interface AgentTimelineEntry {
  id: string;
  at: number;
  kind: string;
  label: string;
  status?: string;
  stepId?: string;
  tool?: string | null;
  detail?: string;
  ok?: boolean;
}

export interface AgentSessionSnapshot {
  id: string;
  agentType: AgentTypeId;
  status: AgentSessionStatus;
  progress: number;
  plan: AgentPlanStep[];
  steps: AgentPlanStep[];
  timeline: AgentTimelineEntry[];
  currentStepIndex: number;
  finalAnswer: string;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  userMessage: string;
}

export type AgentStreamEventType =
  | 'session_start'
  | 'status'
  | 'plan'
  | 'progress'
  | 'timeline'
  | 'step_start'
  | 'step_done'
  | 'step_failed'
  | 'tool_start'
  | 'tool_done'
  | 'retry'
  | 'delta'
  | 'completed'
  | 'error'
  | 'cancelled'
  | 'paused'
  | 'resumed'
  | 'done';

export interface AgentStreamEvent {
  type: AgentStreamEventType | string;
  sessionId?: string;
  agentType?: AgentTypeId;
  agentName?: string;
  status?: AgentSessionStatus;
  progress?: number;
  plan?: AgentPlanStep[];
  step?: AgentPlanStep;
  stepId?: string;
  name?: string;
  displayName?: string;
  ok?: boolean;
  error?: string;
  detail?: string;
  entry?: AgentTimelineEntry;
  delta?: string;
  text?: string;
  replace?: boolean;
  answer?: string;
  steps?: AgentPlanStep[];
  reason?: string;
  attempt?: number;
  done?: boolean;
  chatId?: string;
  code?: string;
}

export interface AgentRunRequest {
  agentType: AgentTypeId;
  message: string;
  messages?: Array<{
    role: string;
    content: string;
    attachments?: unknown[];
  }>;
  chatId?: string | null;
  projectId?: string | null;
  fileIds?: string[];
  attachments?: unknown[];
}

/** UI progress labels shown in the execution timeline. */
export const DEFAULT_PROGRESS_LABELS = [
  'Planning...',
  'Searching...',
  'Reading sources...',
  'Analyzing...',
  'Generating answer...',
  'Completed',
] as const;
