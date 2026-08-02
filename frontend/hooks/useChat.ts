'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL, USER_EMAIL, USER_NAME } from '@/lib/constants';
import type { Message, MessageAttachment } from '@/lib/types';

interface StreamEvent {
  delta?: string;
  done?: boolean;
  chatId?: string;
  projectId?: string;
  error?: string;
  rag?: { used?: boolean; chars?: number };
}

function toWireAttachments(attachments?: MessageAttachment[]) {
  if (!attachments?.length) return undefined;
  return attachments.map((a) => ({
    id: a.id,
    name: a.name,
    mimeType: a.mimeType,
    size: a.size,
    kind: a.kind,
    dataBase64: a.dataBase64,
  }));
}

export function useChat(options?: { projectId?: string | null }) {
  const projectId = options?.projectId ?? null;
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatIdRef = useRef<string | null>(null);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  // Switching projects starts a fresh local thread (server chats remain).
  useEffect(() => {
    setMessages([]);
    setChatId(null);
    chatIdRef.current = null;
  }, [projectId]);

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

  const finalizeLastMessage = useCallback(() => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant') {
        next[next.length - 1] = { ...last, isStreaming: false };
      }
      return next;
    });
  }, []);

  const handleSendMessage = useCallback(
    async (content: string, attachments?: MessageAttachment[]) => {
      const hasAttachments = !!attachments?.length;
      if (!content.trim() && !hasAttachments) return;

      const newUserMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: content.trim(),
        attachments,
      };

      const updatedMessagesList = [...messages, newUserMessage];
      const streamingId = (Date.now() + 1).toString();
      const placeholderMessage: Message = {
        id: streamingId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      setMessages([...updatedMessagesList, placeholderMessage]);
      setIsLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const payload = {
          messages: updatedMessagesList.map((m) => ({
            role: m.role,
            content: m.content,
            attachments: toWireAttachments(m.attachments),
          })),
          userEmail: USER_EMAIL,
          userName: USER_NAME,
          chatId: chatIdRef.current || undefined,
          projectId: projectId || undefined,
        };

        const response = await fetch(`${API_BASE_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error('Backend response error');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
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

            let event: StreamEvent;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            if (event.delta) {
              appendToLastMessage(event.delta);
            } else if (event.error) {
              appendToLastMessage(`\n\n_${event.error}_`);
            } else if (event.done && event.chatId) {
              setChatId(event.chatId);
              chatIdRef.current = event.chatId;
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // User pressed Stop — keep whatever streamed so far.
        } else {
          console.error('Message error:', error);
          appendToLastMessage(
            'Backend se connect nahi ho pa raha hai. Please check if your server is running on port 5001.'
          );
        }
      } finally {
        setIsLoading(false);
        finalizeLastMessage();
        abortControllerRef.current = null;
      }
    },
    [messages, projectId, appendToLastMessage, finalizeLastMessage]
  );

  const stopGenerating = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
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
  }, []);

  const loadChat = useCallback(async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/chat/${id}`);
    if (!response.ok) throw new Error('Unable to load chat');
    const chat = await response.json();
    const loaded: Message[] = (chat.messages || []).map(
      (m: { role: 'user' | 'assistant'; content: string }, index: number) => ({
        id: `${id}-${index}`,
        role: m.role,
        content: m.content,
      })
    );
    setMessages(loaded);
    setChatId(chat._id);
    chatIdRef.current = chat._id;
  }, []);

  return {
    messages,
    chatId,
    isLoading,
    handleSendMessage,
    stopGenerating,
    appendToLastMessage,
    finalizeLastMessage,
    clearMessages,
    setMessages,
    loadChat,
  };
}
