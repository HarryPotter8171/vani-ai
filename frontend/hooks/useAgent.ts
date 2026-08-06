'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  agentManager,
  createExecutorState,
  reduceExecutorState,
  type AgentRunRequest,
  type AgentSession,
  type AgentStreamEvent,
  type AgentTypeId,
  type AgentTypeInfo,
} from '@/lib/agents';
import type { ExecutorState } from '@/lib/agents/Executor';
import { GateDenialError, type GateDenial } from '@/lib/billing/gateError';

export interface UseAgentOptions {
  chatId?: string | null;
  projectId?: string | null;
  onChatId?: (chatId: string) => void;
  onDelta?: (text: string, meta?: { replace?: boolean }) => void;
  onComplete?: (answer: string, chatId?: string) => void;
  onError?: (message: string) => void;
  onGateDenial?: (denial: GateDenial) => void;
}

export function useAgent(options: UseAgentOptions = {}) {
  const {
    chatId,
    projectId,
    onChatId,
    onDelta,
    onComplete,
    onError,
    onGateDenial,
  } = options;

  // Stabilize parent callbacks so handleEvent/run identities don't churn
  // when parents pass inline arrows (e.g. toast wrappers).
  const onChatIdRef = useRef(onChatId);
  const onDeltaRef = useRef(onDelta);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const onGateDenialRef = useRef(onGateDenial);
  useEffect(() => {
    onChatIdRef.current = onChatId;
    onDeltaRef.current = onDelta;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
    onGateDenialRef.current = onGateDenial;
  }, [onChatId, onDelta, onComplete, onError, onGateDenial]);

  const [agents, setAgents] = useState<AgentTypeInfo[]>(() =>
    agentManager.listLocalAgents()
  );
  const [selectedAgent, setSelectedAgent] = useState<AgentTypeId | null>(null);
  const [executor, setExecutor] = useState<ExecutorState>(() => createExecutorState());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<AgentSession | null>(null);
  const lastRequestRef = useRef<AgentRunRequest | null>(null);

  useEffect(() => {
    let cancelled = false;
    agentManager.listAgents().then((list) => {
      if (!cancelled) setAgents(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEvent = useCallback((event: AgentStreamEvent) => {
    if (event.sessionId) setSessionId(event.sessionId);
    setExecutor((prev) => reduceExecutorState(prev, event));

    if (event.type === 'delta') {
      const chunk = event.delta || event.text || '';
      if (chunk) {
        onDeltaRef.current?.(chunk, event.replace ? { replace: true } : undefined);
      }
    }

    if (event.type === 'completed' || event.type === 'done') {
      if (event.chatId) onChatIdRef.current?.(event.chatId);
    }

    if (event.type === 'error' && event.error) {
      onErrorRef.current?.(event.error);
    }
  }, []);

  const run = useCallback(
    async (request: Omit<AgentRunRequest, 'agentType'> & {
      agentType?: AgentTypeId;
    }) => {
      const agentType = request.agentType || selectedAgent;
      if (!agentType) {
        onErrorRef.current?.('Select an agent first');
        return null;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const session = agentManager.createSession(agentType);
      sessionRef.current = session;
      setExecutor(createExecutorState());
      setSessionId(null);
      setIsRunning(true);
      setTimelineOpen(true);

      const fullRequest: AgentRunRequest = {
        ...request,
        agentType,
        chatId: request.chatId ?? chatId ?? undefined,
        projectId: request.projectId ?? projectId ?? undefined,
      };
      lastRequestRef.current = fullRequest;

      try {
        const result = await agentManager.run(fullRequest, {
          session,
          signal: controller.signal,
          onEvent: handleEvent,
        });

        if (result.chatId) onChatIdRef.current?.(result.chatId);
        onCompleteRef.current?.(session.finalAnswer, result.chatId);
        return result;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setExecutor((prev) =>
            reduceExecutorState(prev, { type: 'cancelled', reason: 'Stopped' })
          );
          return null;
        }
        if (err instanceof GateDenialError) {
          onGateDenialRef.current?.(err.denial);
          const message = err.message || 'Agent run failed';
          if (!onGateDenialRef.current) onErrorRef.current?.(message);
          setExecutor((prev) =>
            reduceExecutorState(prev, { type: 'error', error: message })
          );
          return null;
        }
        const message = (err as Error).message || 'Agent run failed';
        onErrorRef.current?.(message);
        setExecutor((prev) =>
          reduceExecutorState(prev, { type: 'error', error: message })
        );
        return null;
      } finally {
        setIsRunning(false);
        abortRef.current = null;
      }
    },
    [selectedAgent, chatId, projectId, handleEvent]
  );

  const cancel = useCallback(async () => {
    const id = sessionId || sessionRef.current?.id;
    abortRef.current?.abort();
    if (id) {
      await agentManager.cancel(id).catch(() => false);
    }
    setIsRunning(false);
    setExecutor((prev) =>
      reduceExecutorState(prev, { type: 'cancelled', reason: 'Cancelled by user' })
    );
  }, [sessionId]);

  const pause = useCallback(async () => {
    const id = sessionId || sessionRef.current?.id;
    if (!id) return false;
    return agentManager.pause(id);
  }, [sessionId]);

  const resume = useCallback(async () => {
    const id = sessionId || sessionRef.current?.id;
    if (!id) return false;
    return agentManager.resume(id);
  }, [sessionId]);

  const retry = useCallback(async () => {
    const previous = lastRequestRef.current;
    if (!previous) return null;

    const id = sessionId || sessionRef.current?.id;
    if (id && executor.failedStepIndex != null) {
      await agentManager.retry(id, executor.failedStepIndex).catch(() => false);
    }

    return run(previous);
  }, [sessionId, executor.failedStepIndex, run]);

  const clearExecution = useCallback(() => {
    abortRef.current?.abort();
    sessionRef.current = null;
    lastRequestRef.current = null;
    setSessionId(null);
    setIsRunning(false);
    setExecutor(createExecutorState());
  }, []);

  const selectAgent = useCallback((id: AgentTypeId | null) => {
    setSelectedAgent(id);
  }, []);

  return {
    agents,
    selectedAgent,
    selectAgent,
    isAgentMode: selectedAgent !== null,
    executor,
    sessionId,
    isRunning,
    timelineOpen,
    setTimelineOpen,
    run,
    cancel,
    pause,
    resume,
    retry,
    clearExecution,
  };
}
