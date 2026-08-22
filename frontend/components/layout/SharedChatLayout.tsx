'use client';

import VirtualizedMessageList from '@/components/chat/VirtualizedMessageList';
import EmptyState from '@/components/chat/EmptyState';
import TypingIndicator from '@/components/chat/TypingIndicator';
import ConversationSkeleton from '@/components/chat/ConversationSkeleton';
import FilesWorkspace from '@/components/workspace/FilesWorkspace';
import AutomationWorkspace from '@/components/workspace/AutomationWorkspace';
import { PageTransition } from '@/components/ui/PageTransition';
import { AnimatePresence } from 'framer-motion';
import type { Message as ChatMessage, MessageFeedback, ChatSummary, Project, MessageAttachment, StreamPhase } from '@/lib/types';
import type { Artifact } from '@/lib/artifacts';
import type { TtsState } from '@/components/chat/MessageActions';
import type { WorkspaceTab } from '@/lib/workspace/types';
import type { AgentTypeInfo } from '@/lib/agents';
import type { ExecutorState as AgentExecutor } from '@/lib/agents/Executor';
import { memo, Suspense } from 'react';

// ... (keep all imports)
import { InlinePanelSkeleton } from '@/components/lazy/PanelSkeletons';
import dynamic from 'next/dynamic';

const AgentStatus = dynamic(() => import('@/components/lazy/FeaturePanels').then(m => m.AgentStatus), { ssr: false });
const ExecutionTimeline = dynamic(() => import('@/components/lazy/FeaturePanels').then(m => m.ExecutionTimeline), { ssr: false });
const ResearchPanel = dynamic(() => import('@/components/lazy/FeaturePanels').then(m => m.ResearchPanel), { ssr: false });

export interface SharedChatLayoutProps {
  messages: ChatMessage[];
  chatId: string | null;
  isLoading: boolean;
  isChatLoading: boolean;
  scrollParentRef: React.RefObject<HTMLElement | null>;
  activeArtifactId?: string | null;
  onOpenArtifact: (id: string) => void;
  onArtifactsDetected: (messageId: string, artifacts: Artifact[]) => void;
  onForgetMemory?: (content: string) => void;
  onRegenerate?: (messageId: string) => void;
  onContinue?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onEditPrompt?: (messageId: string) => void;
  onEditAndResend?: (messageId: string, newContent: string) => void;
  onFeedback?: (messageId: string, value: MessageFeedback | null) => void;
  onOpenInCanvas?: (messageId: string, content: string) => void;
  onShareMessage?: (messageId: string, content: string) => void;
  onPinMessage?: (messageId: string) => void;
  onSaveResponse?: (messageId: string, content: string) => void;
  onExportMarkdown?: (messageId: string, content: string) => void;
  onExportPdf?: (messageId: string, content: string) => void;
  onDeleteResponse?: (messageId: string) => void;
  regenerateDisabled?: boolean;
  ttsMessageId?: string | null;
  ttsState?: TtsState;
  ttsParagraphIndex?: number;
  onReadAloud?: (messageId: string, content: string) => void;
  onPauseAloud?: () => void;
  onStopAloud?: () => void;
  
  // Empty state props
  onSuggestionClick?: (text: string) => void;
  recentChats?: ChatSummary[];
  recentProjects?: Project[];
  activeProject?: Project | null;
  knowledgeFiles?: any[];
  onSelectChat?: (chatId: string) => void;
  onSelectProject?: (projectId: string | null) => void;
  onOpenCanvas?: () => void;
  onOpenVoice?: () => void;
  onOpenDashboard?: () => void;
  onOpenMemory?: () => void;
  showWelcome?: boolean;
  
  // Workspace state
  workspaceTab?: WorkspaceTab;
  activeProjectId?: string | null;
  mainFiles?: {
    files: any[];
    loading: boolean;
    refresh: () => void;
  };
  onUploadKnowledge?: (file: any) => Promise<void>;
  onDeleteProjectFile?: (fileId: string) => void;
  onSummarize?: (name: string) => void;
  onResearch?: (name: string) => void;
  
  // Automation state
  browserRun?: any;
  isBrowserStarting?: boolean;
  browserError?: string | null;
  handleStartBrowserAutomation?: (input: any) => Promise<any>;
  openBrowserPanel?: () => void;
  
  // Chat chrome
  voiceLive?: boolean;
  streamPhase?: StreamPhase | null;
  showTypingIndicator?: boolean;
  viewKey?: string;
  messagesEndRef?: React.RefObject<HTMLDivElement | null>;
  scrollBottomInset?: number;
  
  // Agent state
  showAgentChrome?: boolean;
  selectedAgentInfo?: AgentTypeInfo | null;
  agentExecutor?: AgentExecutor;
  isAgentRunning?: boolean;
  agentTimelineOpen?: boolean;
  setAgentTimelineOpen?: (open: boolean) => void;
  cancelAgentCb?: () => void;
  retryAgentCb?: () => void;
  
  // Research state
  showResearchChrome?: boolean;
  researchState?: any;
  isResearchRunning?: boolean;
  researchPanelOpen?: boolean;
  setResearchPanelOpen?: (open: boolean) => void;
  stopResearchCb?: () => void;
  interruptedSessionId?: string | null;
  resumeResearchCb?: () => void;
  researchFollowUp?: (q: string) => void;
}

/**
 * SharedChatLayout - Common chat and workspace UI components shared between mobile and desktop
 */
function SharedChatLayout({
  messages,
  chatId,
  isLoading,
  isChatLoading,
  scrollParentRef,
  activeArtifactId,
  onOpenArtifact,
  onArtifactsDetected,
  onForgetMemory,
  onRegenerate,
  onContinue,
  onRetry,
  onEditPrompt,
  onEditAndResend,
  onFeedback,
  onOpenInCanvas,
  onShareMessage,
  onPinMessage,
  onSaveResponse,
  onExportMarkdown,
  onExportPdf,
  onDeleteResponse,
  regenerateDisabled,
  ttsMessageId,
  ttsState,
  ttsParagraphIndex,
  onReadAloud,
  onPauseAloud,
  onStopAloud,
  onSuggestionClick,
  recentChats,
  recentProjects,
  activeProject,
  knowledgeFiles,
  onSelectChat,
  onSelectProject,
  onOpenCanvas,
  onOpenVoice,
  onOpenDashboard,
  onOpenMemory,
  showWelcome = true,
  workspaceTab = 'chat',
  activeProjectId,
  mainFiles,
  onUploadKnowledge,
  onDeleteProjectFile,
  onSummarize,
  onResearch,
  browserRun,
  isBrowserStarting,
  browserError,
  handleStartBrowserAutomation,
  openBrowserPanel,
  voiceLive,
  streamPhase,
  showTypingIndicator,
  viewKey,
  messagesEndRef,
  scrollBottomInset = 0,
  showAgentChrome,
  selectedAgentInfo,
  agentExecutor,
  isAgentRunning,
  agentTimelineOpen,
  setAgentTimelineOpen,
  cancelAgentCb,
  retryAgentCb,
  showResearchChrome,
  researchState,
  isResearchRunning,
  researchPanelOpen,
  setResearchPanelOpen,
  stopResearchCb,
  interruptedSessionId,
  resumeResearchCb,
  researchFollowUp,
}: SharedChatLayoutProps) {
  const hasMessages = messages.length > 0;
  const showEmptyState = showWelcome && !hasMessages && !isLoading && workspaceTab === 'chat';

  return (
    <div className="flex flex-col">
      {workspaceTab === 'files' && mainFiles && (
        <PageTransition viewKey="files">
          <FilesWorkspace
            projectId={activeProjectId || null}
            projectName={activeProject?.name}
            files={mainFiles.files}
            loading={mainFiles.loading}
            onRefresh={mainFiles.refresh}
            onUpload={onUploadKnowledge}
            onDelete={onDeleteProjectFile}
            onSummarize={onSummarize}
            onResearch={onResearch}
          />
        </PageTransition>
      )}

      {workspaceTab === 'automation' && handleStartBrowserAutomation && (
        <PageTransition viewKey="automation">
          <AutomationWorkspace
            run={browserRun}
            isStarting={isBrowserStarting}
            error={browserError}
            onStart={handleStartBrowserAutomation}
            onOpenPanel={openBrowserPanel}
          />
        </PageTransition>
      )}

      {(workspaceTab === 'chat' || workspaceTab === 'canvas' || workspaceTab === 'research') && (
        <AnimatePresence mode="wait">
          {voiceLive ? (
            <PageTransition viewKey="voice-live">
              <div
                className="flex min-h-[40vh] flex-col items-center justify-center px-6 py-16 text-center"
                aria-hidden
              >
                <p className="text-body font-medium tracking-[-0.02em] text-muted-foreground/70">
                  Live Mode is active
                </p>
                <p className="mt-1.5 max-w-sm text-sm text-muted-foreground/50">
                  Conversation continues in Live Mode — chat messages stay
                  hidden until you end the session.
                </p>
              </div>
            </PageTransition>
          ) : isChatLoading && !hasMessages ? (
            <PageTransition viewKey="loading">
              <ConversationSkeleton />
            </PageTransition>
          ) : showEmptyState ? (
            <PageTransition viewKey="empty">
              <EmptyState
                onSuggestionClick={onSuggestionClick}
                recentChats={recentChats}
                recentProjects={recentProjects}
                activeProject={activeProject}
                knowledgeFiles={knowledgeFiles}
                onSelectChat={onSelectChat}
                onSelectProject={onSelectProject}
                onOpenCanvas={onOpenCanvas}
                onOpenVoice={onOpenVoice}
                onOpenDashboard={onOpenDashboard}
                onOpenMemory={onOpenMemory}
              />
            </PageTransition>
          ) : (
            <PageTransition viewKey={viewKey || 'chat'}>
              <div className="flex flex-col">
                {hasMessages && (
                  <VirtualizedMessageList
                    messages={messages}
                    threadKey={chatId || 'new'}
                    scrollParentRef={scrollParentRef}
                    activeArtifactId={activeArtifactId}
                    onOpenArtifact={onOpenArtifact}
                    onArtifactsDetected={onArtifactsDetected}
                    onForgetMemory={onForgetMemory}
                    onRegenerate={onRegenerate}
                    onContinue={onContinue}
                    onRetry={onRetry}
                    onEditPrompt={onEditPrompt}
                    onEditAndResend={onEditAndResend}
                    onFeedback={onFeedback}
                    onOpenInCanvas={onOpenInCanvas}
                    onShareMessage={onShareMessage}
                    onPinMessage={onPinMessage}
                    onSaveResponse={onSaveResponse}
                    onExportMarkdown={onExportMarkdown}
                    onExportPdf={onExportPdf}
                    onDeleteResponse={onDeleteResponse}
                    regenerateDisabled={regenerateDisabled}
                    ttsMessageId={ttsMessageId}
                    ttsState={ttsState}
                    ttsParagraphIndex={ttsParagraphIndex}
                    onReadAloud={onReadAloud}
                    onPauseAloud={onPauseAloud}
                    onStopAloud={onStopAloud}
                  />
                )}

                <AnimatePresence>
                  {showTypingIndicator ? (
                    <TypingIndicator key="typing" phase={streamPhase} />
                  ) : null}
                </AnimatePresence>

                {showAgentChrome && agentExecutor && (
                  <div className="mt-3 mb-1 space-y-2">
                    <Suspense fallback={<InlinePanelSkeleton />}>
                      <AgentStatus
                        agent={selectedAgentInfo || null}
                        executor={agentExecutor}
                        isRunning={!!isAgentRunning}
                      />
                      {setAgentTimelineOpen && (
                        <ExecutionTimeline
                          executor={agentExecutor}
                          isRunning={!!isAgentRunning}
                          open={!!agentTimelineOpen}
                          onOpenChange={setAgentTimelineOpen}
                          onCancel={cancelAgentCb}
                          onRetry={retryAgentCb}
                        />
                      )}
                    </Suspense>
                  </div>
                )}

                {showResearchChrome && researchState && (
                  <div className="mt-3 mb-1">
                    <Suspense fallback={<InlinePanelSkeleton />}>
                      <ResearchPanel
                        state={researchState}
                        isRunning={!!isResearchRunning}
                        open={!!researchPanelOpen}
                        onOpenChange={setResearchPanelOpen}
                        onStop={stopResearchCb}
                        canResume={
                          !!interruptedSessionId ||
                          researchState.status === 'paused' ||
                          researchState.status === 'cancelled'
                        }
                        onResume={resumeResearchCb}
                        onFollowUp={researchFollowUp}
                      />
                    </Suspense>
                  </div>
                )}

                <div
                  ref={messagesEndRef}
                  className="h-4 w-full"
                  style={{ scrollMarginBottom: scrollBottomInset }}
                  aria-hidden
                />
              </div>
            </PageTransition>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

export default memo(SharedChatLayout);