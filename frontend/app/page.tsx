'use client';

import React, { useRef, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ChatInput from '@/components/ChatInput';
import Message from '@/components/Message';
import EmptyState from '@/components/chat/EmptyState';
import TypingIndicator from '@/components/chat/TypingIndicator';
import { useChat } from '@/hooks/useChat';

export default function ChatPage() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const { messages, isLoading, handleSendMessage, clearMessages } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const onSuggestionClick = (text: string) => {
    handleSendMessage(text);
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden">
      {/* Ambient background */}
      <div className="app-background" aria-hidden="true" />

      <div className="relative z-10 flex h-full w-full">
        {/* Floating sidebar */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onNewChat={clearMessages}
        />

        {/* Main chat area */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Floating header */}
          <Header onToggleSidebar={() => setIsSidebarOpen(true)} />

          {/* Messages scroll region */}
          <main className="custom-scrollbar relative flex-1 overflow-y-auto overflow-x-hidden scroll-smooth">
            <div className="mx-auto flex w-full max-w-[680px] flex-col px-5 pb-48 pt-[88px] md:px-6 md:pt-[96px]">
              <AnimatePresence mode="wait">
                {messages.length === 0 ? (
                  <EmptyState onSuggestionClick={onSuggestionClick} />
                ) : (
                  <div className="flex flex-col gap-1">
                    {messages.map((msg) => (
                      <Message
                        key={msg.id}
                        id={msg.id}
                        role={msg.role}
                        content={msg.content}
                        isStreaming={msg.isStreaming}
                      />
                    ))}

                    {isLoading && <TypingIndicator />}

                    <div ref={messagesEndRef} className="h-4 w-full" />
                  </div>
                )}
              </AnimatePresence>
            </div>
          </main>

          {/* Floating transparent input */}
          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
