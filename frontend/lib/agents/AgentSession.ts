/**
 * Client-side AgentSession — mirrors backend lifecycle for UI state.
 */

import type {
  AgentPlanStep,
  AgentSessionSnapshot,
  AgentSessionStatus,
  AgentStreamEvent,
  AgentTimelineEntry,
  AgentTypeId,
} from './types';

export class AgentSession {
  id: string | null = null;
  agentType: AgentTypeId = 'general';
  status: AgentSessionStatus = 'idle';
  progress = 0;
  plan: AgentPlanStep[] = [];
  steps: AgentPlanStep[] = [];
  timeline: AgentTimelineEntry[] = [];
  currentStepIndex = -1;
  finalAnswer = '';
  error: string | null = null;
  userMessage = '';

  reset(): void {
    this.id = null;
    this.status = 'idle';
    this.progress = 0;
    this.plan = [];
    this.steps = [];
    this.timeline = [];
    this.currentStepIndex = -1;
    this.finalAnswer = '';
    this.error = null;
    this.userMessage = '';
  }

  applyEvent(event: AgentStreamEvent): void {
    if (event.sessionId) this.id = event.sessionId;
    if (event.agentType) this.agentType = event.agentType;
    if (typeof event.progress === 'number') this.progress = event.progress;

    switch (event.type) {
      case 'session_start':
        this.status = 'planning';
        this.progress = event.progress ?? 0;
        break;
      case 'status':
        if (event.status) this.status = event.status;
        break;
      case 'plan':
        this.plan = event.plan || [];
        this.steps = event.plan ? event.plan.map((s) => ({ ...s })) : this.steps;
        this.status = 'running';
        break;
      case 'step_start':
        if (event.step) {
          this.upsertStep(event.step);
          this.currentStepIndex = event.step.index ?? this.currentStepIndex;
        }
        this.status = 'running';
        break;
      case 'step_done':
      case 'step_failed':
        if (event.step) this.upsertStep(event.step);
        break;
      case 'timeline':
        if (event.entry) this.timeline = [...this.timeline, event.entry];
        break;
      case 'delta': {
        const chunk = event.delta || event.text || '';
        if (!chunk) break;
        // Identity / caption enforcement may replace the full answer mid-stream.
        if (event.replace) this.finalAnswer = chunk;
        else this.finalAnswer += chunk;
        break;
      }
      case 'completed':
        this.status = 'completed';
        this.progress = 100;
        if (event.answer) this.finalAnswer = event.answer;
        if (event.steps) this.steps = event.steps;
        break;
      case 'error':
        this.status = 'failed';
        this.error = event.error || 'Agent failed';
        break;
      case 'cancelled':
        this.status = 'cancelled';
        this.error = event.reason || 'Cancelled';
        break;
      case 'paused':
        this.status = 'paused';
        break;
      case 'resumed':
        this.status = 'running';
        break;
      default:
        break;
    }

    // Soft timeline labels when server didn't send a timeline entry.
    if (
      event.type === 'tool_start' ||
      event.type === 'tool_done' ||
      event.type === 'retry' ||
      event.type === 'status'
    ) {
      const label =
        event.displayName ||
        event.name ||
        event.detail ||
        (event.type === 'status' ? event.status : event.type) ||
        'Update';
      this.timeline = [
        ...this.timeline,
        {
          id: `${event.type}-${Date.now()}-${this.timeline.length}`,
          at: Date.now(),
          kind: event.type,
          label: String(label),
          tool: event.name,
          detail: event.error || event.detail,
          ok: event.ok,
          stepId: event.stepId,
        },
      ];
    }
  }

  private upsertStep(step: AgentPlanStep): void {
    const idx = this.steps.findIndex((s) => s.id === step.id);
    if (idx === -1) {
      this.steps = [...this.steps, step];
      return;
    }
    const next = [...this.steps];
    next[idx] = { ...next[idx], ...step };
    this.steps = next;
  }

  toSnapshot(): AgentSessionSnapshot {
    return {
      id: this.id || '',
      agentType: this.agentType,
      status: this.status,
      progress: this.progress,
      plan: this.plan,
      steps: this.steps,
      timeline: this.timeline,
      currentStepIndex: this.currentStepIndex,
      finalAnswer: this.finalAnswer,
      error: this.error,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userMessage: this.userMessage,
    };
  }

  get isActive(): boolean {
    return (
      this.status === 'planning' ||
      this.status === 'running' ||
      this.status === 'paused' ||
      this.status === 'verifying'
    );
  }
}
