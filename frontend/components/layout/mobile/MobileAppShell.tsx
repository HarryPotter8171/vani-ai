'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import MobileHeader from './MobileHeader';
import MobileSidebarDrawer from './MobileSidebarDrawer';
import MobileChatContainer from './MobileChatContainer';
import MobileComposer from './MobileComposer';
import ProjectWorkspaceBar from '@/components/workspace/ProjectWorkspaceBar';
import type { ChatSummary, Message, Project, MessageAttachment } from '@/lib/types';
import type { AgentTypeInfo, AgentTypeId } from '@/lib/agents';

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
  selectedAgent?: AgentTypeId | null;
  onSelectAgent?: (id: AgentTypeId | null) => void;
  webSearchEnabled?: boolean;
  deepResearchEnabled?: boolean;
  onToggleWebSearch?: (value: boolean) => void;
  onToggleDeepResearch?: (value: boolean) => void;
  selectedModel?: string;
  onSelectModel?: (modelKey: string) => void;
  projectDefaultModel?: string | null;

  // Workspace state
  workspaceTab?: string;
  activeProject?: Project | null;
  onNavigateProject?: (dest: string) => void;
  isEmptyHome?: boolean;
  
  // Additional props for child components
  children?: React.ReactNode;
  scrollParentRef?: React.RefObject<HTMLDivElement | null>;
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
  workspaceTab,
  activeProject,
  onNavigateProject,
  isEmptyHome,
  children,
  scrollParentRef,
}: MobileAppShellProps) {
  const [composerHeight, setComposerHeight] = useState(0);
  const [workspaceBarHeight, setWorkspaceBarHeight] = useState(0);
  const workspaceBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!workspaceBarRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setWorkspaceBarHeight(entries[0].contentRect.height);
    });
    ro.observe(workspaceBarRef.current);
    return () => ro.disconnect();
  }, []);

  const handleHeightChange = useCallback((height: number) => {
    setComposerHeight(height);
  }, []);

  // Hide main chat when Canvas is in surface mode on mobile
  const showMainChat = !isCanvasOpen || canvasMobileSurface === 'chat';

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
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
        onSelectChat={(id) => {
          onSelectChat(id);
          onCloseSidebar();
        }}
        onSelectProject={(id) => {
          onSelectProject(id);
          onCloseSidebar();
        }}
      />

      {/* Workspace Bar */}
      {showMainChat && activeProject && !isEmptyHome && onNavigateProject && (
        <div ref={workspaceBarRef} className="mt-[calc(48px+env(safe-area-inset-top,0px))]">
          <ProjectWorkspaceBar
            project={activeProject}
            active={workspaceTab === 'files' ? 'files' : 'chat'}
            onNavigate={onNavigateProject}
          />
        </div>
      )}

      {/* Main Chat Area */}
      {showMainChat && (
        <MobileChatContainer
          ref={scrollParentRef}
          messages={messages}
          chatId={chatId}
          isLoading={isLoading}
          isChatLoading={isChatLoading}
          composerHeight={composerHeight}
          workspaceBarHeight={workspaceBarHeight}
          // Adjust padding if workspace bar is present
          className={cn(activeProject && !isEmptyHome && 'pt-0')}
        >
          {children}
        </MobileChatContainer>
      )}

      {/* Mobile Composer */}
      {showMainChat && (!isEmptyHome || workspaceTab === 'chat') && (
        <MobileComposer
          onSendMessage={onSendMessage}
          isLoading={isLoading || isChatLoading}
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