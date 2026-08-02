'use client';

import { useCallback, useState } from 'react';
import { API_BASE_URL, USER_EMAIL, USER_NAME } from '@/lib/constants';
import type { Message } from '@/lib/types';

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
    async (content: string) => {
      const newUserMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content,
      };

      const updatedMessagesList = [...messages, newUserMessage];
      setMessages(updatedMessagesList);
      setIsLoading(true);

      const streamingId = (Date.now() + 1).toString();

      try {
        const payload = {
          messages: updatedMessagesList.map((m) => ({ role: m.role, content: m.content })),
          userEmail: USER_EMAIL,
          userName: USER_NAME,
        };

        const response = await fetch(`${API_BASE_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error('Backend response error');
        }

        const data = await response.json();
        const reply =
          data.reply || data.response || data.message || 'No reply received.';

        const newAiMessage: Message = {
          id: streamingId,
          role: 'assistant',
          content: reply,
          isStreaming: false,
        };

        setMessages((prev) => [...prev, newAiMessage]);
      } catch (error) {
        console.error('Message error:', error);
        const errorMessage: Message = {
          id: streamingId,
          role: 'assistant',
          content:
            'Backend se connect nahi ho pa raha hai. Please check if your server is running on port 5001.',
          isStreaming: false,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
        finalizeLastMessage();
      }
    },
    [messages, finalizeLastMessage]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    handleSendMessage,
    appendToLastMessage,
    finalizeLastMessage,
    clearMessages,
    setMessages,
  };
}
