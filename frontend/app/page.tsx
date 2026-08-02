'use client';

import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ChatInput from '@/components/ChatInput';
import Message from '@/components/Message';
import EmptyState from '@/components/chat/EmptyState';
import TypingIndicator from '@/components/chat/TypingIndicator';
import ArtifactPanel from '@/components/artifacts/ArtifactPanel';
import { useChat } from '@/hooks/useChat';
import { useProjects } from '@/hooks/useProjects';
import type { Artifact } from '@/lib/artifacts';

export default function ChatPage() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const {
    projects,
    pinnedProjects,
    activeProjectId,
    activeProject,
    projectChats,
    selectProject,
    createProject,
    renameProject,
    deleteProject,
    duplicateProject,
    archiveProject,
    pinProject,
    uploadKnowledgeFile,
    saveMemory,
    refreshProjects,
    refreshProjectChats,
  } = useProjects();

  const {
    messages,
    chatId,
    isLoading,
    handleSendMessage,
    stopGenerating,
    clearMessages,
    loadChat,
  } = useChat({ projectId: activeProjectId });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Each Message detects its own artifacts (memoized to its own content) and
  // reports them up here via an effect, so unrelated messages never
  // recompute or re-render just because another message is streaming.
  const [artifactsByMessage, setArtifactsByMessage] = useState<Record<string, Artifact[]>>({});

  const handleArtifactsDetected = useCallback((messageId: string, artifacts: Artifact[]) => {
    setArtifactsByMessage((prev) =>
      prev[messageId] === artifacts ? prev : { ...prev, [messageId]: artifacts }
    );
  }, []);

  const allArtifacts = useMemo(
    () => Object.values(artifactsByMessage).flat(),
    [artifactsByMessage]
  );

  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [isArtifactPanelOpen, setIsArtifactPanelOpen] = useState(false);
  const [isArtifactFullscreen, setIsArtifactFullscreen] = useState(false);

  const activeArtifact = useMemo(
    () => allArtifacts.find((a) => a.id === activeArtifactId) ?? null,
    [allArtifacts, activeArtifactId]
  );

  const handleOpenArtifact = useCallback((id: string) => {
    setActiveArtifactId(id);
    setIsArtifactPanelOpen(true);
  }, []);

  const handleCloseArtifactPanel = useCallback(() => {
    setIsArtifactPanelOpen(false);
    setIsArtifactFullscreen(false);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    setIsArtifactFullscreen((v) => !v);
  }, []);

  // Auto-open (and follow) a newly-detected artifact the first time it
  // appears, mirroring Claude's "opens the panel as it starts writing code"
  // behavior — but only once per artifact id, so it never fights a user who
  // has manually switched to viewing a different, older artifact.
  const seenArtifactIdsRef = useRef(new Set<string>());
  useEffect(() => {
    for (const artifact of allArtifacts) {
      if (!seenArtifactIdsRef.current.has(artifact.id)) {
        seenArtifactIdsRef.current.add(artifact.id);
        setActiveArtifactId(artifact.id);
        setIsArtifactPanelOpen(true);
      }
    }
  }, [allArtifacts]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const onSuggestionClick = (text: string) => {
    handleSendMessage(text);
  };

  const lastMessage = messages[messages.length - 1];
  const showTypingIndicator =
    isLoading && (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.content === '');

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
          projects={projects}
          pinnedProjects={pinnedProjects}
          activeProjectId={activeProjectId}
          projectChats={projectChats}
          activeChatId={chatId}
          onSelectProject={(id) => {
            void selectProject(id);
            clearMessages();
          }}
          onCreateProject={async (name) => {
            await createProject({ name });
          }}
          onRenameProject={renameProject}
          onDeleteProject={deleteProject}
          onDuplicateProject={async (id) => {
            await duplicateProject(id);
          }}
          onArchiveProject={archiveProject}
          onPinProject={pinProject}
          onUploadKnowledge={async (projectId, file) => {
            await uploadKnowledgeFile(projectId, file);
            if (activeProjectId === projectId) {
              await refreshProjectChats(projectId);
            }
            await refreshProjects();
          }}
          onSaveMemory={async (projectId, memory) => {
            await saveMemory(projectId, memory);
            await refreshProjects();
          }}
          onSelectChat={(id) => {
            void loadChat(id);
          }}
          onSearchProjects={(q) => {
            void refreshProjects(q);
          }}
        />

        {/* Main chat area */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Floating header */}
          <Header
            onToggleSidebar={() => setIsSidebarOpen(true)}
            projectName={activeProject?.name}
          />

          {/* Messages scroll region */}
          <main className="custom-scrollbar relative flex-1 overflow-y-auto overflow-x-hidden scroll-smooth">
            <div className="mx-auto flex w-full max-w-[680px] flex-col px-5 pb-48 pt-[88px] md:px-6 md:pt-[96px]">
              <AnimatePresence mode="wait">
                {messages.length === 0 ? (
                  <EmptyState onSuggestionClick={onSuggestionClick} />
                ) : (
                  <div className="flex flex-col">
                    {messages.map((msg) => {
                      // Empty streaming placeholder is represented by TypingIndicator
                      // instead, so the two loading affordances never double up.
                      if (msg.role === 'assistant' && msg.isStreaming && msg.content === '') {
                        return null;
                      }
                      return (
                        <Message
                          key={msg.id}
                          id={msg.id}
                          role={msg.role}
                          content={msg.content}
                          isStreaming={msg.isStreaming}
                          attachments={msg.attachments}
                          activeArtifactId={activeArtifactId}
                          onOpenArtifact={handleOpenArtifact}
                          onArtifactsDetected={handleArtifactsDetected}
                        />
                      );
                    })}

                    {showTypingIndicator && <TypingIndicator />}

                    <div ref={messagesEndRef} className="h-4 w-full" />
                  </div>
                )}
              </AnimatePresence>
            </div>
          </main>

          {/* Floating transparent input */}
          <ChatInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            onStopGenerating={stopGenerating}
          />
        </div>

        {/* Artifact panel — only ever rendered when an artifact exists and is open */}
        <AnimatePresence>
          {isArtifactPanelOpen && activeArtifact && (
            <ArtifactPanel
              artifact={activeArtifact}
              isFullscreen={isArtifactFullscreen}
              onToggleFullscreen={handleToggleFullscreen}
              onClose={handleCloseArtifactPanel}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
