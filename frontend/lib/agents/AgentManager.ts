/**
 * Client AgentManager — lists agents, runs SSE sessions, pause/resume/cancel/retry.
 */

import { apiFetch } from '@/lib/apiClient';
import { AgentSession } from './AgentSession';
import { initBuiltinToolMetadata, toolRegistry } from './ToolRegistry';
import { memoryManager } from './MemoryManager';
import type {
  AgentRunRequest,
  AgentStreamEvent,
  AgentTypeId,
  AgentTypeInfo,
} from './types';

const FALLBACK_AGENTS: AgentTypeInfo[] = [
  {
    id: 'general',
    name: 'General Assistant',
    description: 'Plans and executes multi-step tasks across all available tools.',
    tools: [
      'web_search',
      'vision',
      'image_generation',
      'image_edit',
      'ocr',
      'memory',
      'canvas',
      'file_upload',
      'calculator',
      'weather',
      'current_time',
      'browser_automation',
      'code_execution',
    ],
  },
  {
    id: 'coding',
    name: 'Coding Agent',
    description: 'Software engineering — design, debug, refactor, and explain code.',
    tools: [
      'calculator',
      'file_upload',
      'vision',
      'image_generation',
      'image_edit',
      'ocr',
      'memory',
      'canvas',
      'current_time',
      'code_execution',
    ],
  },
  {
    id: 'research',
    name: 'Research Agent',
    description: 'Deep research with web sources, synthesis, and citations.',
    tools: [
      'web_search',
      'memory',
      'vision',
      'image_generation',
      'image_edit',
      'ocr',
      'file_upload',
      'current_time',
      'browser_automation',
      'code_execution',
    ],
  },
  {
    id: 'writing',
    name: 'Writing Agent',
    description: 'Drafts, edits, and polishes long-form writing.',
    tools: [
      'memory',
      'canvas',
      'file_upload',
      'web_search',
      'current_time',
      'image_generation',
      'image_edit',
      'ocr',
      'vision',
    ],
  },
  {
    id: 'data_analysis',
    name: 'Data Analysis Agent',
    description: 'Analyzes tables, charts, metrics, and uploaded data files.',
    tools: [
      'calculator',
      'file_upload',
      'vision',
      'ocr',
      'image_generation',
      'image_edit',
      'memory',
      'current_time',
      'code_execution',
      'canvas',
    ],
  },
  {
    id: 'web',
    name: 'Web Agent',
    description: 'Live web lookup and browser automation.',
    tools: [
      'web_search',
      'weather',
      'current_time',
      'memory',
      'browser_automation',
      'image_generation',
      'ocr',
      'vision',
    ],
  },
];

async function parseSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      break;
    }

    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;
      try {
        onEvent(JSON.parse(jsonStr) as AgentStreamEvent);
      } catch {
        /* ignore malformed frames */
      }
    }
  }
}

export class AgentManager {
  readonly tools = toolRegistry;
  readonly memory = memoryManager;

  private agentsCache: AgentTypeInfo[] | null = null;

  constructor() {
    initBuiltinToolMetadata();
  }

  listLocalAgents(): AgentTypeInfo[] {
    return FALLBACK_AGENTS;
  }

  async listAgents(): Promise<AgentTypeInfo[]> {
    try {
      const res = await apiFetch('/agents');
      if (!res.ok) throw new Error('Failed to list agents');
      const data = await res.json();
      const agents = Array.isArray(data?.agents) ? (data.agents as AgentTypeInfo[]) : [];
      const resolved = agents.length ? agents : FALLBACK_AGENTS;
      this.agentsCache = resolved;
      return resolved;
    } catch {
      this.agentsCache = FALLBACK_AGENTS;
      return FALLBACK_AGENTS;
    }
  }

  getCachedAgents(): AgentTypeInfo[] {
    return this.agentsCache || FALLBACK_AGENTS;
  }

  getAgent(id: AgentTypeId): AgentTypeInfo {
    return (
      this.getCachedAgents().find((a) => a.id === id) ||
      FALLBACK_AGENTS.find((a) => a.id === id) ||
      FALLBACK_AGENTS[0]
    );
  }

  createSession(agentType: AgentTypeId = 'general'): AgentSession {
    const session = new AgentSession();
    session.agentType = agentType;
    return session;
  }

  async run(
    request: AgentRunRequest,
    {
      session,
      signal,
      onEvent,
    }: {
      session?: AgentSession;
      signal?: AbortSignal;
      onEvent?: (event: AgentStreamEvent) => void;
    } = {}
  ): Promise<{ session: AgentSession; chatId?: string }> {
    const active = session || this.createSession(request.agentType);
    active.agentType = request.agentType;
    active.userMessage = request.message;
    active.status = 'planning';

    const preparedMessages = this.memory.prepareConversationPayload(
      request.messages || []
    );

    const response = await apiFetch('/agents/run', {
      method: 'POST',
      body: JSON.stringify({
        ...request,
        messages: preparedMessages,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const { parseGateDenial, GateDenialError } = await import(
        '@/lib/billing/gateError'
      );
      const denial = await parseGateDenial(response);
      if (denial) throw new GateDenialError(denial);
      const errText = await response.text().catch(() => '');
      throw new Error(errText || 'Agent run failed');
    }

    let chatId: string | undefined;

    await parseSseStream(
      response.body,
      (event) => {
        // Normalize delta field
        if (event.delta && !event.type) {
          event = { ...event, type: 'delta' };
        }
        if (event.type === 'delta' && !event.delta && event.text) {
          event = { ...event, delta: event.text };
        }

        active.applyEvent(event);
        if (event.chatId) chatId = event.chatId;
        if (event.type === 'done' && event.chatId) chatId = event.chatId;
        onEvent?.(event);
      },
      signal
    );

    return { session: active, chatId };
  }

  async pause(sessionId: string): Promise<boolean> {
    const res = await apiFetch(`/agents/sessions/${sessionId}/pause`, {
      method: 'POST',
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.ok);
  }

  async resume(sessionId: string): Promise<boolean> {
    const res = await apiFetch(`/agents/sessions/${sessionId}/resume`, {
      method: 'POST',
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.ok);
  }

  async cancel(sessionId: string, reason?: string): Promise<boolean> {
    const res = await apiFetch(`/agents/sessions/${sessionId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.ok);
  }

  async retry(sessionId: string, stepIndex?: number): Promise<boolean> {
    const res = await apiFetch(`/agents/sessions/${sessionId}/retry`, {
      method: 'POST',
      body: JSON.stringify({ stepIndex }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.ok);
  }
}

export const agentManager = new AgentManager();
