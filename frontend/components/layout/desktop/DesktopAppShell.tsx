'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ChatInput, { type ChatInputHandle } from '@/components/ChatInput';
import type { ChatSummary, Message, Project } from '@/lib/types';
import type { AgentTypeInfo, AgentTypeId } from '@/lib/agents';
import type { MessageAttachment } from '@/lib/types';

export interface DesktopAppShellProps {
  // Layout state
  isSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  
  // Chat state
  messages: Message[];
  chatId: string | null;
  isLoading: boolean;
  isChatLoading: boolean;
  
  // Sidebar data
  recentChats: ChatSummary[];
  isLoadingChats: boolean;
  chatsError: string | null;
  chatsQuery: string;
  activeChatId: string | null;
  projects: Project[];
  pinnedProjects: Project[];
  activeProjectId: string | null;
  projectChats: ChatSummary[];
  
  // Panel state
  isArtifactPanelOpen: boolean;
  isCanvasOpen: boolean;
  canvasMobileSurface: 'chat' | 'canvas';
  browserPanelOpen: boolean;
  codePanelOpen: boolean;
  
  // Sidebar actions
  onToggleSidebar: () => void;
  onCloseSidebar: () => void;
  onOpenSidebar: () => void;
  onToggleCollapsed: () => void;
  onNewChat: () => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  onDeleteChat: (chatId: string) => void;
  onPinChat: (chatId: string, pinned: boolean) => void;
  onSearchChats: (q: string) => void;
  onLoadMoreChats: () => void;
  hasMoreChats: boolean;
  isLoadingMoreChats: boolean;
  onSelectProject: (projectId: string | null) => void;
  onCreateProject: (name: string) => Promise<void> | void;
  onRenameProject: (projectId: string, name: string) => Promise<void> | void;
  onDeleteProject: (projectId: string) => Promise<void> | void;
  onDuplicateProject: (projectId: string) => Promise<void> | void;
  onArchiveProject: (projectId: string) => Promise<void> | void;
  onPinProject: (projectId: string, pinned: boolean) => Promise<void> | void;
  onUploadKnowledge: (projectId: string, file: any) => Promise<void> | void;
  onSaveMemory: (projectId: string, memory: any) => Promise<void> | void;
  onSelectChat: (chatId: string) => void;
  onSearchProjects: (q: string) => void;
  onOpenMemory: () => void;
  onOpenSettings: () => void;
  onOpenBilling: () => void;
  onOpenAgents: () => void;
  onOpenAnalytics: () => void;
  onOpenDashboard: () => void;
  onOpenKnowledge: () => void;
  onOpenCanvasWorkspace: () => void;
  onOpenImages: () => void;
  onOpenResearch: () => void;
  onOpenAutomation: () => void;
  showAnalytics: boolean;
  conversationTitle: string;
  shareableChatId: string | null;
  onShowArtifact: () => void;
  onShowCanvas: () => void;
  onShowBrowser: () => void;
  onShowCodeInterpreter: () => void;
  
  // Chat actions
  onSendMessage: (message: string, attachments?: MessageAttachment[]) => void;
  onStopGenerating: () => void;
  onOpenVoiceMode: () => void;
  
  // Composer props
  chatInputRef: React.RefObject<ChatInputHandle>;
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
  
  // Additional content
  children?: React.ReactNode;
  dock?: React.ReactNode;
}

/**
 * DesktopAppShell - Desktop layout (>768px)
 * 
 * Preserves existing desktop functionality:
 * - Left sidebar with collapsible state
 * - Main chat area
 * - Optional Canvas / workspace panels
 * - Desktop toolbar
 * - Larger interaction areas
 * - Resizable panels
 */
function DesktopAppShell({
  isSidebarOpen,
  isSidebarCollapsed,
  messages,
  chatId,
  isLoading,
  isChatLoading,
  recentChats,
  isLoadingChats,
  chatsError,
  chatsQuery,
  activeChatId,
  projects,
  pinnedProjects,
  activeProjectId,
  projectChats,
  isArtifactPanelOpen,
  isCanvasOpen,
  canvasMobileSurface,
  browserPanelOpen,
  codePanelOpen,
  onToggleSidebar,
  onCloseSidebar,
  onOpenSidebar,
  onToggleCollapsed,
  onNewChat,
  onRenameChat,
  onDeleteChat,
  onPinChat,
  onSearchChats,
  onLoadMoreChats,
  hasMoreChats,
  isLoadingMoreChats,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onDuplicateProject,
  onArchiveProject,
  onPinProject,
  onUploadKnowledge,
  onSaveMemory,
  onSelectChat,
  onSearchProjects,
  onOpenMemory,
  onOpenSettings,
  onOpenBilling,
  onOpenAgents,
  onOpenAnalytics,
  onOpenDashboard,
  onOpenKnowledge,
  onOpenCanvasWorkspace,
  onOpenImages,
  onOpenResearch,
  onOpenAutomation,
  showAnalytics,
  conversationTitle,
  shareableChatId,
  onShowArtifact,
  onShowCanvas,
  onShowBrowser,
  onShowCodeInterpreter,
  onSendMessage,
  onStopGenerating,
  onOpenVoiceMode,
  chatInputRef,
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
  dock,
}: DesktopAppShellProps) {
  return (
    <div className="relative z-10 flex h-full w-full min-w-0 flex-col md:flex-row md:pt-0">
      {/* Desktop Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={onCloseSidebar}
        onOpen={onOpenSidebar}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={onToggleCollapsed}
        onNewChat={onNewChat}
        onRenameChat={onRenameChat}
        onDeleteChat={onDeleteChat}
        onPinChat={onPinChat}
        recentChats={recentChats}
        isLoadingChats={isLoadingChats}
        chatsError={chatsError}
        chatsQuery={chatsQuery}
        onSearchChats={onSearchChats}
        hasMoreChats={hasMoreChats}
        isLoadingMoreChats={isLoadingMoreChats}
        onLoadMoreChats={onLoadMoreChats}
        projects={projects}
        pinnedProjects={pinnedProjects}
        activeProjectId={activeProjectId}
        projectChats={projectChats}
        activeChatId={activeChatId}
        onSelectProject={onSelectProject}
        onCreateProject={onCreateProject}
        onRenameProject={onRenameProject}
        onDeleteProject={onDeleteProject}
        onDuplicateProject={onDuplicateProject}
        onArchiveProject={onArchiveProject}
        onPinProject={onPinProject}
        onUploadKnowledge={onUploadKnowledge}
        onSaveMemory={onSaveMemory}
        onSelectChat={onSelectChat}
        onSearchProjects={onSearchProjects}
        onOpenMemory={onOpenMemory}
        onOpenSettings={onOpenSettings}
        onOpenBilling={onOpenBilling}
        onOpenAgents={onOpenAgents}
        onOpenAnalytics={onOpenAnalytics}
        onOpenDashboard={onOpenDashboard}
        onOpenKnowledge={onOpenKnowledge}
        onOpenCanvasWorkspace={onOpenCanvasWorkspace}
        onOpenImages={onOpenImages}
        onOpenResearch={onOpenResearch}
        onOpenAutomation={onOpenAutomation}
        showAnalytics={showAnalytics}
        messages={messages}
        conversationTitle={conversationTitle}
        shareableChatId={shareableChatId}
        hasArtifact={messages.some(m => m.attachments?.length)}
        isArtifactOpen={isArtifactPanelOpen && !isCanvasOpen}
        onShowArtifact={onShowArtifact}
        hasCanvas={false} // Will be determined by canvas state
        isCanvasOpen={isCanvasOpen}
        onShowCanvas={onShowCanvas}
        hasBrowser={browserPanelOpen}
        isBrowserOpen={browserPanelOpen}
        onShowBrowser={onShowBrowser}
        hasCodeInterpreter={codePanelOpen}
        isCodeInterpreterOpen={codePanelOpen}
        onShowCodeInterpreter={onShowCodeInterpreter}
      />

      {/* Main chat area */}
      <div
        id="main-content"
        role="main"
        className={cn(
          'relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-x-hidden',
          (isCanvasOpen && canvasMobileSurface === 'canvas') ||
          (isArtifactPanelOpen && !isCanvasOpen)
            ? 'hidden md:flex'
            : 'flex'
        )}
      >
        <Header onToggleSidebar={onToggleSidebar} />
        
        {/* Main content area */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>

        {/* Desktop Composer */}
        <ChatInput
          ref={chatInputRef}
          onSendMessage={onSendMessage}
          isLoading={isLoading}
          onStopGenerating={onStopGenerating}
          onOpenVoiceMode={onOpenVoiceMode}
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
          dock={dock}
        />
      </div>
    </div>
  );
}

export default memo(DesktopAppShell);