/**
 * VANI AI Agents — frontend framework entry.
 *
 * Architecture:
 *   User → Planner → Task Breakdown → Tool Selection →
 *   Execution → Result Verification → Final Response
 */

export { AgentManager, agentManager } from './AgentManager';
export { AgentSession } from './AgentSession';
export { Planner, planner, suggestedProgressLabels, activeStepLabel } from './Planner';
export { Executor, executor, createExecutorState, reduceExecutorState } from './Executor';
export {
  ToolRegistry,
  toolRegistry,
  registerTool,
  getTool,
  listTools,
  checkPermission,
  BUILTIN_AGENT_TOOLS,
  initBuiltinToolMetadata,
} from './ToolRegistry';
export { MemoryManager, memoryManager } from './MemoryManager';
export type {
  AgentTypeId,
  AgentTypeInfo,
  AgentSessionStatus,
  AgentStepStatus,
  AgentPlanStep,
  AgentTimelineEntry,
  AgentSessionSnapshot,
  AgentStreamEvent,
  AgentStreamEventType,
  AgentRunRequest,
} from './types';
export { DEFAULT_PROGRESS_LABELS } from './types';
