'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelResearchSession,
  createEmptyResearchState,
  fetchResearchSession,
  hydrateResearchStateFromSession,
  reduceResearchState,
  resumeResearchSession,
  runResearchStream,
  type ResearchState,
  type ResearchStreamEvent,
} from '@/lib/research';
import { GateDenialError, type GateDenial } from '@/lib/billing/gateError';
import { getUserFriendlyError } from '@/lib/userFacingError';

export interface UseDeepResearchOptions {
  chatId?: string | null;
  projectId?: string | null;
  onChatId?: (chatId: string) => void;
  onDelta?: (text: string) => void;
  onComplete?: (
    report: string,
    chatId?: string | null,
    meta?: { confidence?: number | null }
  ) => void;
  onError?: (message: string) => void;
  onGateDenial?: (denial: GateDenial) => void;
}

const INTERRUPT_KEY = 'vani.research.interruptedSession';

function clearInterruptStorage() {
  try {
    localStorage.removeItem(INTERRUPT_KEY);
  } catch {
    /* ignore */
  }
}

export function useDeepResearch(options: UseDeepResearchOptions = {}) {
  const {
    chatId,
    projectId,
    onChatId,
    onDelta,
    onComplete,
    onError,
    onGateDenial,
  } = options;

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

  const [enabled, setEnabled] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [state, setState] = useState<ResearchState>(() => createEmptyResearchState());
  const [isRunning, setIsRunning] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [interruptedSessionId, setInterruptedSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(INTERRUPT_KEY);
    } catch {
      return null;
    }
  });

  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const hydratedInterruptRef = useRef<string | null>(null);

  // Restore interrupted-session chrome after reload (panel + Resume).
  useEffect(() => {
    const id = interruptedSessionId;
    if (!id || hydratedInterruptRef.current === id) return;

    let cancelled = false;
    hydratedInterruptRef.current = id;

    void (async () => {
      try {
        const session = await fetchResearchSession(id);
        if (cancelled) return;

        const hydrated = hydrateResearchStateFromSession(session);
        sessionIdRef.current = hydrated.sessionId || id;

        if (hydrated.status === 'completed') {
          clearInterruptStorage();
          setInterruptedSessionId(null);
          setState(hydrated);
          return;
        }

        // Ensure Resume chrome is visible even if progress was never persisted.
        if (
          hydrated.status === 'idle' ||
          hydrated.progress === 0
        ) {
          hydrated.status =
            hydrated.status === 'idle' ? 'cancelled' : hydrated.status;
          if (hydrated.progress === 0 && !hydrated.error) {
            hydrated.error = 'Interrupted — resume to continue';
          }
        }

        setState(hydrated);
        setPanelOpen(true);
        setEnabled(true);
        if (hydrated.chatId) onChatIdRef.current?.(hydrated.chatId);
      } catch {
        if (cancelled) return;
        // Stale interrupt id (404 / network) — drop it so chrome does not linger.
        clearInterruptStorage();
        setInterruptedSessionId(null);
        hydratedInterruptRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [interruptedSessionId]);

  const handleEvent = useCallback((event: ResearchStreamEvent) => {
    if (event.sessionId) {
      sessionIdRef.current = event.sessionId;
      try {
        localStorage.setItem(INTERRUPT_KEY, event.sessionId);
      } catch {
        /* ignore */
      }
    }

    setState((prev) => reduceResearchState(prev, event));

    if (event.type === 'delta' && event.delta) {
      // Parent chat streams are append-only; skip replace frames (fallback/identity).
      if (!event.replace) onDeltaRef.current?.(event.delta);
    }

    if (event.type === 'completed' || (event.type === 'done' && event.chatId)) {
      if (event.chatId) onChatIdRef.current?.(event.chatId);
    }

    if (event.type === 'completed') {
      clearInterruptStorage();
      setInterruptedSessionId(null);
      onCompleteRef.current?.(event.report || '', event.chatId, {
        confidence:
          typeof event.confidence === 'number' ? event.confidence : null,
      });
    }

    if (event.type === 'error' && event.error) {
      onErrorRef.current?.(
        getUserFriendlyError(event.error, {
          feature: 'research',
          fallback: 'Deep Research failed',
        })
      );
    }
  }, []);

  const run = useCallback(
    async (
      query: string,
      opts?: { resumeSessionId?: string | null; chatId?: string | null }
    ) => {
      const q = query.trim();
      if (!q && !opts?.resumeSessionId) return null;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState(createEmptyResearchState());
      setIsRunning(true);
      setPanelOpen(true);
      setEnabled(true);

      try {
        const result = await runResearchStream(
          {
            query: q,
            chatId: opts?.chatId ?? chatId ?? undefined,
            projectId: projectId ?? undefined,
            resumeSessionId: opts?.resumeSessionId ?? undefined,
          },
          { signal: controller.signal, onEvent: handleEvent }
        );

        if (result.chatId) onChatIdRef.current?.(result.chatId);
        return result;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setState((prev) =>
            reduceResearchState(prev, { type: 'cancelled', reason: 'Stopped' })
          );
          return null;
        }
        if (err instanceof GateDenialError) {
          onGateDenialRef.current?.(err.denial);
          const message = getUserFriendlyError(err, {
            feature: 'research',
            fallback: 'Deep Research failed',
          });
          if (!onGateDenialRef.current) onErrorRef.current?.(message);
          setState((prev) =>
            reduceResearchState(prev, { type: 'error', error: message })
          );
          return null;
        }
        const message = getUserFriendlyError(err, {
          feature: 'research',
          fallback: 'Deep Research failed',
        });
        onErrorRef.current?.(message);
        setState((prev) =>
          reduceResearchState(prev, { type: 'error', error: message })
        );
        return null;
      } finally {
        setIsRunning(false);
        abortRef.current = null;
      }
    },
    [chatId, projectId, handleEvent]
  );

  const stop = useCallback(async () => {
    const id = sessionIdRef.current || state.sessionId;
    abortRef.current?.abort();
    if (id) {
      await cancelResearchSession(id);
      try {
        localStorage.setItem(INTERRUPT_KEY, id);
        setInterruptedSessionId(id);
        hydratedInterruptRef.current = id;
      } catch {
        /* ignore */
      }
    }
    setIsRunning(false);
    setState((prev) =>
      reduceResearchState(prev, { type: 'cancelled', reason: 'Stopped' })
    );
  }, [state.sessionId]);

  const resumeInterrupted = useCallback(async () => {
    const id = interruptedSessionId || sessionIdRef.current;
    if (!id) return null;

    // Prefer live resume endpoint first, then SSE resume.
    // Empty query is fine — the server restores the saved query when needed.
    await resumeResearchSession(id).catch(() => false);
    return run(state.query || '', { resumeSessionId: id });
  }, [interruptedSessionId, run, state.query]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setState(createEmptyResearchState());
    setIsRunning(false);
    sessionIdRef.current = null;
  }, []);

  const toggleDeepResearch = useCallback((value?: boolean) => {
    setEnabled((prev) => {
      const next = typeof value === 'boolean' ? value : !prev;
      if (next) setWebSearchEnabled(false);
      return next;
    });
  }, []);

  const toggleWebSearch = useCallback((value?: boolean) => {
    setWebSearchEnabled((prev) => {
      const next = typeof value === 'boolean' ? value : !prev;
      if (next) setEnabled(false);
      return next;
    });
  }, []);

  return {
    enabled,
    setEnabled: toggleDeepResearch,
    webSearchEnabled,
    setWebSearchEnabled: toggleWebSearch,
    state,
    isRunning,
    panelOpen,
    setPanelOpen,
    interruptedSessionId,
    run,
    stop,
    resumeInterrupted,
    clear,
  };
}
