'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { fileContentUrl } from '@/lib/upload';
import type { Message, MessageAttachment } from '@/lib/types';
import type { TurnMeta, TurnUsage } from '@/lib/models';
import {
  GateDenialError,
  parseGateDenial,
  type GateDenial,
} from '@/lib/billing/gateError';

interface StreamEvent {
  delta?: string;
  /** When true, replace the assistant message content instead of appending. */
  replace?: boolean;
  done?: boolean;
  chatId?: string;
  projectId?: string;
  error?: string;
  rag?: { used?: boolean; chars?: number };
  meta?: TurnMeta;
  usage?: TurnUsage;
  /** Generated image from the image_generation / image_edit tool. */
  image?: {
    mimeType?: string;
    dataBase64?: string;
    prompt?: string;
    fileId?: string | null;
    size?: number;
  };
  tool?: {
    status?: 'start' | 'done';
    id?: string;
    name?: string;
    displayName?: string;
    ok?: boolean;
    error?: string;
  };
}

// Shape persisted server-side (models/Chat.js) — never includes the raw
// base64 payload, only lightweight metadata for re-rendering attachment chips.
interface StoredAttachment {
  id?: string;
  fileId?: string;
  name: string;
  mimeType?: string;
  size?: number;
  kind?: MessageAttachment['kind'];
  extractedText?: string;
}

interface StoredMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  wasInterrupted?: boolean;
  attachments?: StoredAttachment[];
  meta?: Message['meta'] & {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    latencyMs?: number;
  };
}

function toWireAttachments(attachments?: MessageAttachment[]) {
  if (!attachments?.length) return undefined;
  return attachments.map((a) => ({
    id: a.fileId || a.id,
    fileId: a.fileId || undefined,
    name: a.name,
    mimeType: a.mimeType,
    size: a.size,
    kind: a.kind,
    // Prefer server-side hydration via fileId — only send base64 as fallback
    // for clients that haven't uploaded yet.
    ...(a.fileId ? {} : a.dataBase64 ? { dataBase64: a.dataBase64 } : {}),
    // Pass OCR text so the backend can skip duplicate Tesseract work.
    ...(a.extractedText ? { extractedText: a.extractedText } : {}),
  }));
}

interface UseChatOptions {
  projectId?: string | null;
  /**
   * Fired once, right after the very first user message of a brand-new chat
   * finishes persisting server-side (i.e. `chatId` is known). Intended for
   * auto-title generation — kept as a side-channel callback so the core
   * send/stream flow above is completely unaffected by it.
   */
  onFirstMessagePersisted?: (chatId: string, userMessage: string) => void;
  /**
   * Mutable ref so parents can toggle Web Search without reordering hooks
   * relative to useDeepResearch (which also needs chatId from this hook).
   */
  preferWebSearchRef?: { current: boolean };
  /** Mutable ref for the selected model key (`auto`, `gemini`, `provider/model`). */
  selectedModelRef?: { current: string };
  /** Quota / plan denials from UsageGuard (402/403). */
  onGateDenial?: (denial: GateDenial) => void;
}

export function useChat(options?: UseChatOptions) {
  const projectId = options?.projectId ?? null;
  const onFirstMessagePersisted = options?.onFirstMessagePersisted;
  const preferWebSearchRef = options?.preferWebSearchRef;
  const selectedModelRef = options?.selectedModelRef;
  const onGateDenial = options?.onGateDenial;
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatIdRef = useRef<string | null>(null);

  // Bumped whenever the active thread changes from under a running stream
  // (loading a different chat, starting a new one, switching projects).
  // Stream callbacks captured before the bump compare against this and
  // become no-ops once stale, so a slow/aborted response from the previous
  // conversation can never mutate the one the user has since switched to.
  const generationRef = useRef(0);

  const invalidateActiveStream = useCallback(() => {
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  }, []);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  // Abort any in-flight stream when the project scope changes (external system).
  useEffect(() => {
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, [projectId]);

  // Switching projects starts a fresh local thread (server chats remain).
  const [scopedProjectId, setScopedProjectId] = useState(projectId);
  if (scopedProjectId !== projectId) {
    setScopedProjectId(projectId);
    setMessages([]);
    setChatId(null);
    setIsLoading(false);
  }

  const appendToLastMessage = useCallback((chunk: string) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant') {
        next[next.length - 1] = {
          ...last,
          content: last.content + chunk,
          isStreaming: true,
        };
      }
      return next;
    });
  }, []);

  /** Coalesce SSE text deltas to ~1 frame (rAF) / 32ms to cut main-thread churn. */
  const pendingDeltaRef = useRef('');
  const deltaFlushRafRef = useRef<number | null>(null);
  const deltaFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingDelta = useCallback(() => {
    if (deltaFlushRafRef.current != null) {
      cancelAnimationFrame(deltaFlushRafRef.current);
      deltaFlushRafRef.current = null;
    }
    if (deltaFlushTimerRef.current != null) {
      clearTimeout(deltaFlushTimerRef.current);
      deltaFlushTimerRef.current = null;
    }
    const pending = pendingDeltaRef.current;
    if (!pending) return;
    pendingDeltaRef.current = '';
    appendToLastMessage(pending);
  }, [appendToLastMessage]);

  const enqueueDelta = useCallback(
    (chunk: string) => {
      if (!chunk) return;
      pendingDeltaRef.current += chunk;
      if (deltaFlushRafRef.current != null || deltaFlushTimerRef.current != null) return;
      if (typeof requestAnimationFrame === 'function') {
        deltaFlushRafRef.current = requestAnimationFrame(() => {
          deltaFlushRafRef.current = null;
          flushPendingDelta();
        });
      } else {
        deltaFlushTimerRef.current = setTimeout(() => {
          deltaFlushTimerRef.current = null;
          flushPendingDelta();
        }, 32);
      }
    },
    [flushPendingDelta]
  );

  const replaceLastMessageContent = useCallback((content: string) => {
    // Replace must win over any coalesced appends.
    pendingDeltaRef.current = '';
    if (deltaFlushRafRef.current != null) {
      cancelAnimationFrame(deltaFlushRafRef.current);
      deltaFlushRafRef.current = null;
    }
    if (deltaFlushTimerRef.current != null) {
      clearTimeout(deltaFlushTimerRef.current);
      deltaFlushTimerRef.current = null;
    }
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant') {
        next[next.length - 1] = {
          ...last,
          content,
          isStreaming: true,
        };
      }
      return next;
    });
  }, []);

  const finalizeLastMessage = useCallback((opts?: { interrupted?: boolean }) => {
    flushPendingDelta();
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role !== 'assistant') return prev;
      // Stop before the first token: drop the empty placeholder bubble.
      if (opts?.interrupted && !last.content?.trim()) {
        next.pop();
        return next;
      }
      next[next.length - 1] = {
        ...last,
        isStreaming: false,
        wasInterrupted: opts?.interrupted ? !!last.content?.trim() : false,
      };
      return next;
    });
  }, [flushPendingDelta]);

  const handleSendMessage = useCallback(
    async (
      content: string,
      attachments?: MessageAttachment[],
      options?: {
        voiceMode?: boolean;
        historyOverride?: Message[];
        /** Resume into an existing interrupted assistant message. */
        continueFromId?: string;
      }
    ) => {
      const historyOverride = options?.historyOverride;
      const continueFromId = options?.continueFromId;
      const hasAttachments = !!attachments?.length;
      if (!historyOverride && !continueFromId && !content.trim() && !hasAttachments) return;

      // Captured before `messages` grows below — the one reliable signal for
      // "this is the first message of this conversation", regardless of
      // whether the chat was pre-created via "New Chat" (chatIdRef already
      // set) or is being created inline by the backend on first send.
      const isFirstMessage =
        !historyOverride && !continueFromId && messages.length === 0;

      const CONTINUE_PROMPT =
        'Continue your previous response exactly from where you left off. Do not repeat what was already written — only continue seamlessly.';

      let updatedMessagesList: Message[];
      let continuePartial = '';

      if (continueFromId) {
        const idx = messages.findIndex((m) => m.id === continueFromId);
        if (idx < 0) return;
        const target = messages[idx];
        if (target.role !== 'assistant' || !target.content?.trim()) return;
        continuePartial = target.content;
        updatedMessagesList = messages.slice(0, idx + 1).map((m, i) =>
          i === idx
            ? { ...m, isStreaming: true, wasInterrupted: false }
            : m
        );
        setMessages(updatedMessagesList);
      } else if (historyOverride) {
        updatedMessagesList = historyOverride;
      } else {
        const newUserMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: content.trim(),
          attachments,
        };
        updatedMessagesList = [...messages, newUserMessage];
      }

      const streamingId = continueFromId || (Date.now() + 1).toString();
      if (!continueFromId) {
        const placeholderMessage: Message = {
          id: streamingId,
          role: 'assistant',
          content: '',
          isStreaming: true,
        };
        setMessages([...updatedMessagesList, placeholderMessage]);
      }
      setIsLoading(true);

      const myGeneration = ++generationRef.current;
      const isCurrentGeneration = () => generationRef.current === myGeneration;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let aborted = false;
      let skipFinalize = false;

      try {
        const wireMessages = continueFromId
          ? [
              ...updatedMessagesList.map((m) => ({
                role: m.role,
                content: m.content,
                attachments: toWireAttachments(m.attachments),
              })),
              { role: 'user' as const, content: CONTINUE_PROMPT },
            ]
          : updatedMessagesList.map((m) => ({
              role: m.role,
              content: m.content,
              attachments: toWireAttachments(m.attachments),
            }));

        const payload = {
          messages: wireMessages,
          // Explicit multi-file ids for the latest turn (backend also reads
          // attachment.fileId). Lets tools/hydration resolve uploads reliably.
          fileIds: (continueFromId
            ? undefined
            : historyOverride
              ? updatedMessagesList[updatedMessagesList.length - 1]?.attachments
              : attachments
          )
            ?.map((a) => a.fileId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
          chatId: chatIdRef.current || undefined,
          projectId: projectId || undefined,
          preferWebSearch: preferWebSearchRef?.current || undefined,
          model: selectedModelRef?.current || undefined,
          voiceMode: options?.voiceMode || undefined,
          continueGenerating: continueFromId ? true : undefined,
        };

        const response = await apiFetch('/chat', {
          method: 'POST',
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const denial = await parseGateDenial(response);
          if (denial) {
            throw new GateDenialError(denial);
          }
          throw new Error('Backend response error');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          // The user navigated away (new chat / loaded a different
          // conversation) — stop applying this stream's output entirely.
          if (!isCurrentGeneration()) break;

          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            if (!isCurrentGeneration()) break;

            const line = frame.trim();
            if (!line.startsWith('data:')) continue;

            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;

            let event: StreamEvent;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            if (event.meta) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role !== 'assistant') return prev;
                next[next.length - 1] = {
                  ...last,
                  meta: {
                    model: event.meta?.modelKey || event.meta?.model,
                    provider: event.meta?.provider,
                    displayName: event.meta?.displayName,
                    reason: event.meta?.reason,
                    fallback: event.meta?.fallback,
                  },
                };
                return next;
              });
            } else if (event.usage) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role !== 'assistant') return prev;
                next[next.length - 1] = {
                  ...last,
                  usage: event.usage,
                };
                return next;
              });
            } else if (event.delta != null && event.delta !== '') {
              if (event.replace) {
                // Image-edit success caption replaces any temporary tool status.
                // Continue identity scrub may also replace with merged full text.
                replaceLastMessageContent(event.delta);
              } else {
                enqueueDelta(event.delta);
              }
            } else if (event.tool?.status === 'start' && event.tool.displayName) {
              // Temporary progress only — replace:true deltas overwrite this.
              // Skip while continuing — keep the partial reply visible.
              if (continueFromId) continue;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role !== 'assistant') return prev;
                if (last.content?.trim()) return prev;
                const label = String(event.tool?.displayName || '').trim();
                const toolContent = /\.\.\.$/.test(label) ? label : `${label}...`;
                next[next.length - 1] = {
                  ...last,
                  content: toolContent,
                  isStreaming: true,
                };
                return next;
              });
            } else if (event.image?.dataBase64 || event.image?.fileId) {
              const mimeType = event.image.mimeType || 'image/png';
              const fileId = event.image.fileId || undefined;
              const previewUrl = event.image.dataBase64
                ? `data:${mimeType};base64,${event.image.dataBase64}`
                : fileId
                  ? fileContentUrl(fileId)
                  : undefined;
              const generated: MessageAttachment = {
                id: fileId || `gen-${Date.now()}`,
                fileId,
                name: event.image.prompt?.trim() || 'Generated image',
                mimeType,
                size:
                  typeof event.image.size === 'number'
                    ? event.image.size
                    : event.image.dataBase64
                      ? Math.floor(event.image.dataBase64.length * 0.75)
                      : 0,
                kind: 'image',
                previewUrl,
                // Keep base64 only when we lack a durable fileId (follow-ups
                // prefer fileId via toWireAttachments).
                ...(fileId ? {} : event.image.dataBase64
                  ? { dataBase64: event.image.dataBase64 }
                  : {}),
              };
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role !== 'assistant') return prev;
                next[next.length - 1] = {
                  ...last,
                  attachments: [...(last.attachments || []), generated],
                  isStreaming: true,
                };
                return next;
              });
            } else if (event.error) {
              appendToLastMessage(`\n\n_${event.error}_`);
            } else if (event.done && event.chatId) {
              setChatId(event.chatId);
              chatIdRef.current = event.chatId;
              if (isFirstMessage) {
                // Attachment-only sends can have empty text — fall back to
                // the first attachment's name so title generation still has
                // something meaningful to work with.
                const titleSource =
                  content.trim() ||
                  attachments?.[0]?.name ||
                  updatedMessagesList[updatedMessagesList.length - 1]?.content ||
                  '';
                onFirstMessagePersisted?.(event.chatId, titleSource);
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // User pressed Stop, or navigated to a different chat — keep
          // whatever streamed so far on the conversation it belongs to.
          aborted = true;
        } else if (error instanceof GateDenialError) {
          if (isCurrentGeneration()) {
            // Drop the empty assistant placeholder — banner/toast handles UX.
            // On continue, restore the partial and keep Continue available.
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant' && !last.content?.trim()) {
                next.pop();
                return next;
              }
              if (continueFromId && last?.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  content: continuePartial || last.content,
                  isStreaming: false,
                  wasInterrupted: true,
                };
                return next;
              }
              return prev;
            });
            onGateDenial?.(error.denial);
            skipFinalize = true;
          }
        } else if (isCurrentGeneration()) {
          console.error('Message error:', error);
          appendToLastMessage(
            'Backend se connect nahi ho pa raha hai. Please check if your server is running on port 5001.'
          );
        }
      } finally {
        if (isCurrentGeneration()) {
          setIsLoading(false);
          if (!skipFinalize) {
            finalizeLastMessage({ interrupted: aborted });
          }
          abortControllerRef.current = null;
        }
      }
    },
    [
      messages,
      projectId,
      preferWebSearchRef,
      selectedModelRef,
      appendToLastMessage,
      replaceLastMessageContent,
      enqueueDelta,
      finalizeLastMessage,
      onFirstMessagePersisted,
      onGateDenial,
    ]
  );

  const regenerateMessage = useCallback(
    async (assistantMessageId: string) => {
      if (isLoading) return;
      const idx = messages.findIndex((m) => m.id === assistantMessageId);
      if (idx < 0) return;
      // Only the latest assistant turn — regenerating an earlier turn would
      // persist a truncated history and permanently drop later messages.
      for (let i = messages.length - 1; i > idx; i -= 1) {
        if (messages[i].role === 'assistant') return;
      }
      let userIdx = idx - 1;
      while (userIdx >= 0 && messages[userIdx].role !== 'user') userIdx -= 1;
      if (userIdx < 0) return;

      const history = messages.slice(0, userIdx + 1);
      await handleSendMessage('', undefined, { historyOverride: history });
    },
    [messages, isLoading, handleSendMessage]
  );

  const continueGenerating = useCallback(
    async (assistantMessageId: string) => {
      if (isLoading) return;
      await handleSendMessage('', undefined, { continueFromId: assistantMessageId });
    },
    [isLoading, handleSendMessage]
  );

  const stopGenerating = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    invalidateActiveStream();
    setMessages((prev) => {
      prev.forEach((m) => {
        m.attachments?.forEach((a) => {
          if (a.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl);
        });
      });
      return [];
    });
    setChatId(null);
    chatIdRef.current = null;
  }, [invalidateActiveStream]);

  // GET /api/chat/:id — fetches the full, persisted message history for a
  // past conversation and swaps it in as the active thread. Any in-flight
  // stream for the previously active chat is invalidated first, so a
  // straggling delta can never land on the conversation the user just
  // switched to (see generationRef above).
  const loadChat = useCallback(async (id: string) => {
    invalidateActiveStream();
    setIsChatLoading(true);
    try {
      const response = await apiFetch(`/chat/${id}`);
      if (!response.ok) {
        throw new Error(
          response.status === 404 ? 'This conversation no longer exists.' : 'Unable to load conversation'
        );
      }

      const chat = await response.json();
      const loaded: Message[] = ((chat.messages || []) as StoredMessage[])
        .filter((m): m is StoredMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
        .map((m, index) => ({
          id: `${id}-${index}`,
          role: m.role,
          content: m.content,
          wasInterrupted: m.role === 'assistant' && !!m.wasInterrupted,
          attachments: m.attachments?.length
            ? m.attachments.map((a, attIndex) => {
                const fileId = a.fileId || a.id;
                const kind = a.kind || 'unknown';
                return {
                  id: fileId || `${id}-${index}-${attIndex}`,
                  fileId,
                  name: a.name,
                  mimeType: a.mimeType || 'application/octet-stream',
                  size: a.size || 0,
                  kind,
                  extractedText: a.extractedText,
                  previewUrl:
                    kind === 'image' && fileId ? fileContentUrl(fileId) : undefined,
                };
              })
            : undefined,
          meta: m.meta
            ? {
                model: m.meta.model,
                provider: m.meta.provider,
              }
            : undefined,
          usage: m.meta
            ? (() => {
                const total =
                  (m.meta.inputTokens || 0) + (m.meta.outputTokens || 0);
                return {
                  inputTokens: m.meta.inputTokens,
                  outputTokens: m.meta.outputTokens,
                  totalTokens: total > 0 ? total : undefined,
                  costUsd: m.meta.costUsd,
                  latencyMs: m.meta.latencyMs,
                  provider: m.meta.provider,
                  model: m.meta.model,
                  modelKey: m.meta.model,
                };
              })()
            : undefined,
        }));

      setMessages(loaded);
      setChatId(chat._id);
      chatIdRef.current = chat._id;
    } finally {
      setIsChatLoading(false);
    }
  }, [invalidateActiveStream]);

  return {
    messages,
    chatId,
    isLoading,
    isChatLoading,
    handleSendMessage,
    regenerateMessage,
    continueGenerating,
    stopGenerating,
    appendToLastMessage,
    replaceLastMessageContent,
    finalizeLastMessage,
    clearMessages,
    setMessages,
    setChatId,
    loadChat,
  };
}
