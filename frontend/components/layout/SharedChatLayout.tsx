'use client';

import React, { memo } from 'react';
import VirtualizedMessageList from '@/components/chat/VirtualizedMessageList';
import EmptyState from '@/components/chat/EmptyState';
import TypingIndicator from '@/components/chat/TypingIndicator';
import ConversationSkeleton from '@/components/chat/ConversationSkeleton';
import type { Message as ChatMessage, MessageFeedback } from '@/lib/types';
import type { Artifact } from '@/lib/artifacts';
import type { TtsState } from '@/components/chat/MessageActions';

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
  // Empty state props - matching DynamicHomeProps
  onSuggestionClick?: (text: string) => void;
  recentChats?: unknown[];
  recentProjects?: unknown[];
  activeProject?: unknown;
  knowledgeFiles?: string[];
  onSelectChat?: (chatId: string) => void;
  onSelectProject?: (projectId: string) => void;
  onOpenCanvas?: () => void;
  onOpenVoice?: () => void;
  onOpenDashboard?: () => void;
  onOpenMemory?: () => void;
  showWelcome?: boolean;
  // New props for quick actions
  onNewChat?: () => void;
  onOpenImages?: () => void;
  onOpenResearch?: () => void;
  onOpenAutomation?: () => void;
}

/**
 * SharedChatLayout - Common chat UI components shared between mobile and desktop
 * 
 * This component contains the shared presentation logic for:
 * - Message list (virtualized)
 * - Empty state / welcome screen
 * - Loading states
 * - Typing indicators
 * 
 * Business logic (hooks, state management) stays in the parent page component.
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
  onNewChat,
  onOpenImages,
  onOpenResearch,
  onOpenAutomation,
  showWelcome = true,
}: SharedChatLayoutProps) {
  const hasMessages = messages.length > 0;
  const showEmptyState = showWelcome && !hasMessages && !isLoading;

  return (
    <>
      {showEmptyState ? (
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
      ) : (
        <>
          {isLoading && !hasMessages ? (
            <ConversationSkeleton />
          ) : (
            <VirtualizedMessageList
              messages={messages}
              threadKey={chatId || undefined}
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

          {isChatLoading && hasMessages && (
            <TypingIndicator />
          )}
        </>
      )}
    </>
  );
}

export default memo(SharedChatLayout);