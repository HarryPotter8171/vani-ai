'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import MobileHeader from './MobileHeader';
import MobileSidebarDrawer from './MobileSidebarDrawer';
import MobileChatContainer from './MobileChatContainer';
import MobileComposer from './MobileComposer';
import type { ChatSummary, Message, Project } from '@/lib/types';
import type { AgentTypeInfo } from '@/lib/agents';
import type { MessageAttachment } from '@/lib/types';

export interface MobileAppShellProps {
  // Chat state
  messages: Message[];
  chatId: string | null;
  isLoading: boolean;
  isChatLoading: boolean;
  
  // Sidebar state
  isSidebarOpen: boolean;
  recentChats: ChatSummary[];
  isLoadingChats: boolean;
  chatsError: string | null;
  activeChatId: string | null;
  projects: Project[];
  pinnedProjects: Project[];
  activeProjectId: string | null;
  projectChats: ChatSummary[];
  
  // Canvas state
  isCanvasOpen: boolean;
  canvasMobileSurface: 'chat' | 'canvas';
  
  // Actions
  onToggleSidebar: () => void;
  onCloseSidebar: () => void;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onSelectProject: (projectId: string | null) => void;
  onSendMessage: (message: string, attachments?: MessageAttachment[]) => void;
  onStopGenerating: () => void;
  onOpenVoiceMode: () => void;
  
  // Composer props
  agents?: AgentTypeInfo[];
  selectedAgent?: string | null;
  onSelectAgent?: (id: string | null) => void;
  webSearchEnabled?: boolean;
  deepResearchEnabled?: boolean;
  onToggleWebSearch?: (value: boolean) => void;
  onToggleDeepResearch?: (value: boolean) => void;
  selectedModel?: string;
  onSelectModel?: (modelKey: string) => void;
  projectDefaultModel?: string | null;
  
  // Additional props for child components
  children?: React.ReactNode;
}

/**
 * MobileAppShell - Dedicated mobile layout (≤768px)
 * 
 * Provides a native app-like experience with:
 * - Compact header with hamburger menu
 * - Full-height sidebar drawer
 * - Single-column chat layout
 * - App-like bottom composer with keyboard support
 * - Safe area support for iOS
 */
function MobileAppShell({
  messages,
  chatId,
  isLoading,
  isChatLoading,
  isSidebarOpen,
  recentChats,
  isLoadingChats,
  chatsError,
  activeChatId,
  projects,
  pinnedProjects,
  activeProjectId,
  projectChats,
  isCanvasOpen,
  canvasMobileSurface,
  onToggleSidebar,
  onCloseSidebar,
  onNewChat,
  onSelectChat,
  onSelectProject,
  onSendMessage,
  onStopGenerating,
  onOpenVoiceMode,
  agents,
  selectedAgent,
  onSelectAgent,
  webSearchEnabled,
  deepResearchEnabled,
  onToggleWebSearch,
  onToggleDeepResearch,
  selectedModel,
  onSelectModel,
  projectDefaultModel,
  children,
}: MobileAppShellProps) {
  const [composerHeight, setComposerHeight] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Handle keyboard auto-scroll
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    
    const scrollToBottom = () => {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    };

    // Scroll to bottom when messages change or when composer opens
    scrollToBottom();
  }, [messages.length, isSidebarOpen, composerHeight]);

  const handleHeightChange = useCallback((height: number) => {
    setComposerHeight(height);
  }, []);

  // Hide main chat when Canvas is in surface mode on mobile
  const showMainChat = !isCanvasOpen || canvasMobileSurface === 'chat';

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Mobile Header */}
      <MobileHeader
        onToggleSidebar={onToggleSidebar}
        title="VANI"
      />

      {/* Mobile Sidebar Drawer */}
      <MobileSidebarDrawer
        isOpen={isSidebarOpen}
        onClose={onCloseSidebar}
        recentChats={recentChats}
        isLoadingChats={isLoadingChats}
        chatsError={chatsError}
        activeChatId={activeChatId}
        projects={projects}
        pinnedProjects={pinnedProjects}
        activeProjectId={activeProjectId}
        projectChats={projectChats}
        onNewChat={onNewChat}
        onSelectChat={(chatId) => {
          onSelectChat(chatId);
          onCloseSidebar();
        }}
        onSelectProject={(projectId) => {
          onSelectProject(projectId);
          onCloseSidebar();
        }}
      />

      {/* Main Chat Area */}
      {showMainChat && (
        <MobileChatContainer
          ref={scrollContainerRef}
          messages={messages}
          chatId={chatId}
          isLoading={isLoading}
          isChatLoading={isChatLoading}
          composerHeight={composerHeight}
        >
          {children}
        </MobileChatContainer>
      )}

      {/* Mobile Composer */}
      {showMainChat && (
        <MobileComposer
          onSendMessage={onSendMessage}
          isLoading={isLoading}
          onStopGenerating={onStopGenerating}
          onOpenVoiceMode={onOpenVoiceMode}
          onHeightChange={handleHeightChange}
          agents={agents}
          selectedAgent={selectedAgent}
          onSelectAgent={onSelectAgent}
          webSearchEnabled={webSearchEnabled}
          deepResearchEnabled={deepResearchEnabled}
          onToggleWebSearch={onToggleWebSearch}
          onToggleDeepResearch={onToggleDeepResearch}
          selectedModel={selectedModel}
          onSelectModel={onSelectModel}
          projectDefaultModel={projectDefaultModel}
        />
      )}
    </div>
  );
}

export default memo(MobileAppShell);