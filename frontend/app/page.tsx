'use client';

import React, {
  Suspense,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useState,
} from 'react';
import { AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ChatInput, { type ChatInputHandle } from '@/components/ChatInput';
import EmptyState from '@/components/chat/EmptyState';
import TypingIndicator from '@/components/chat/TypingIndicator';
import ConversationSkeleton from '@/components/chat/ConversationSkeleton';
import VirtualizedMessageList from '@/components/chat/VirtualizedMessageList';
import ContextPanel from '@/components/workspace/ContextPanel';
import ProjectWorkspaceBar from '@/components/workspace/ProjectWorkspaceBar';
import DropActionsOverlay from '@/components/workspace/DropActionsOverlay';
import FilesWorkspace, { useProjectFiles } from '@/components/workspace/FilesWorkspace';
import AutomationWorkspace from '@/components/workspace/AutomationWorkspace';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useMemory } from '@/hooks/useMemory';
import type { DropActionId, WorkspaceTab } from '@/lib/workspace/types';
import { browserExecutionPhaseFromRun } from '@/lib/browser';
import {
  getAttachmentKind,
  readFileAsBase64,
  resolveMimeType,
} from '@/lib/files';
import {
  ArtifactPanel,
  CanvasPanel,
  MemoryManager,
  McpSettings,
  ResearchPanel,
  BrowserPanel,
  BrowserPermissionDialog,
  CodeInterpreterPanel,
  BillingSettings,
  AnalyticsPanel,
  AdminDashboard,
  AiDashboard,
  ExecutionTimeline,
  AgentStatus,
  DialogSkeleton,
  InlinePanelSkeleton,
  ModalPanelSkeleton,
  SidePanelSkeleton,
} from '@/components/lazy/FeaturePanels';
import { useChat } from '@/hooks/useChat';
import { useMessageTts } from '@/hooks/useMessageTts';
import { useAgent } from '@/hooks/useAgent';
import { useDeepResearch } from '@/hooks/useDeepResearch';
import { useBrowser } from '@/hooks/useBrowser';
import { useCodeInterpreter } from '@/hooks/useCodeInterpreter';
import {
  CommandPaletteProvider,
  COMMAND_ICONS,
  type CommandAction,
} from '@/components/ui/CommandPalette';
import { KeyboardShortcutsProvider } from '@/components/ui/KeyboardShortcuts';
import { PageTransition } from '@/components/ui/PageTransition';
import { useCanvas } from '@/hooks/useCanvas';
import OpenCanvasConfirmSheet from '@/components/canvas/OpenCanvasConfirmSheet';
import { useProjects } from '@/hooks/useProjects';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { QuotaExceededBanner } from '@/components/billing/QuotaExceededBanner';
import UpgradePlanModal from '@/components/billing/UpgradePlanModal';
import { type GateDenial } from '@/lib/billing/gateError';
import { forgetMemory } from '@/lib/memory';
import type { Artifact } from '@/lib/artifacts';
import type { ChatSummary, MessageAttachment } from '@/lib/types';
import { isDevAuthClientEnabled } from '@/lib/auth/clientFlags';
import { fetchAnalyticsIdentity } from '@/lib/analytics';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { CompactControlSkeleton } from '@/components/lazy/PanelSkeletons';
// New shell components
import MobileAppShell from '@/components/layout/mobile/MobileAppShell';
import DesktopAppShell from '@/components/layout/desktop/DesktopAppShell';
import SharedChatLayout from '@/components/layout/SharedChatLayout';

const VoiceModeHost = dynamic(() => import('@/components/voice/VoiceModeHost'), {
  ssr: false,
  loading: () => (
    <div
      className="pointer-events-none fixed z-[84] bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] right-4 sm:bottom-8 sm:right-8"
      aria-hidden
    >
      <CompactControlSkeleton className="h-12 w-12 sm:h-14 sm:w-14" />
    </div>
  ),
});

// Optimistic "New Chat" rows are keyed with this prefix until the server
// confirms creation — lets us tell them apart from real, persisted chat ids.
const TEMP_CHAT_PREFIX = 'temp-';
const isTempChatId = (id: string | null): id is string =>
  !!id && id.startsWith(TEMP_CHAT_PREFIX);

export default function ChatPage() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = React.useState(false);
  const [isMcpSettingsOpen, setIsMcpSettingsOpen] = React.useState(false);
  const [isBillingOpen, setIsBillingOpen] = React.useState(false);
  const [settingsSection, setSettingsSection] = React.useState<
    'general' | 'appearance' | 'ai' | 'memory' | 'profile' | 'billing' | 'about'
  >('general');
  const [isAnalyticsOpen, setIsAnalyticsOpen] = React.useState(false);
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = React.useState(false);
  const [isAiDashboardOpen, setIsAiDashboardOpen] = React.useState(false);
  const [showAnalyticsNav, setShowAnalyticsNav] = React.useState(
    () => isDevAuthClientEnabled()
  );
  const [quotaDenial, setQuotaDenial] = React.useState<GateDenial | null>(null);
  const [upgradeDenial, setUpgradeDenial] = React.useState<GateDenial | null>(null);
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
    deleteFile,
    saveMemory,
    refreshProjects,
    refreshProjectChats,
    updateProjectChatTitle,
  } = useProjects();

  const {
    chats: recentChats,
    isLoading: isLoadingChats,
    error: chatsError,
    query: chatsQuery,
    search: searchChats,
    refresh: refreshChatHistory,
    hasMore: hasMoreChats,
    isLoadingMore: isLoadingMoreChats,
    loadMore: loadMoreChats,
    createChat: createChatOnServer,
    addOptimisticChat,
    replaceChat,
    removeChat,
    insertChatAt,
    deleteChatOnServer,
    updateChatTitle,
    generateTitle,
    saveTitle,
    updateChatPinned,
    setChatPinned,
  } = useChatHistory();

  const { showToast } = useToast();
  const confirm = useConfirm();

  // Stable so hooks that accept onError (canvas/agent) never see a new
  // function identity on every ChatPage render — that previously retriggered
  // effects which called showToast and blew the update depth limit.
  const notifyError = useCallback(
    (message: string) => {
      showToast(message, 'error');
    },
    [showToast]
  );

  const handleGateDenial = useCallback((denial: GateDenial) => {
    if (denial.code === 'PLAN_REQUIRED') {
      setUpgradeDenial(denial);
      setQuotaDenial(null);
      return;
    }
    setUpgradeDenial(null);
    setQuotaDenial(denial);
  }, []);

  // Auto-title generation: fired once, right after the first user message of
  // a brand-new chat is persisted (see useChat's `onFirstMessagePersisted`).
  // Fully decoupled from the send/stream flow above — it runs in the
  // background and never blocks or alters it. Generation + persistence are
  // deliberately two calls (generate-title, then the existing, validated
  // PATCH /api/chat/:id/title) so title *saving* stays a single, reusable
  // code path shared with any future manual rename UI.
  const handleFirstMessagePersisted = useCallback(
    async (newChatId: string, userMessage: string) => {
      try {
        const title = await generateTitle(newChatId, userMessage);
        if (!title) return; // chat already had a real title — nothing to save

        await saveTitle(newChatId, title);

        // Update whichever sidebar list this chat currently lives in.
        updateChatTitle(newChatId, title);
        if (activeProjectId) updateProjectChatTitle(newChatId, title);
      } catch (err) {
        console.error('Auto-title generation failed:', err);
      }
    },
    [generateTitle, saveTitle, updateChatTitle, updateProjectChatTitle, activeProjectId]
  );

  const preferWebSearchRef = React.useRef(false);
  // Model selection: project default, with optional per-session user override.
  // Reset override when the active project changes (same render-time pattern as
  // useChat's scopedProjectId — avoids a cascading useEffect).
  const DEFAULT_MODEL_STORAGE_KEY = 'vani-default-model';
  const [userModel, setUserModel] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(DEFAULT_MODEL_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [modelScopeProjectId, setModelScopeProjectId] = useState(activeProjectId);
  if (modelScopeProjectId !== activeProjectId) {
    setModelScopeProjectId(activeProjectId);
    try {
      setUserModel(
        typeof window !== 'undefined'
          ? localStorage.getItem(DEFAULT_MODEL_STORAGE_KEY)
          : null
      );
    } catch {
      setUserModel(null);
    }
  }
  const projectDefaultModel =
    activeProject?.settings?.model &&
    activeProject.settings.model !== 'gemini' &&
    activeProject.settings.model !== 'auto'
      ? activeProject.settings.model
      : 'auto';
  const selectedModel = userModel ?? projectDefaultModel;
  const selectedModelRef = React.useRef(selectedModel);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const handleSelectModel = useCallback((modelKey: string) => {
    setUserModel(modelKey);
    try {
      localStorage.setItem(DEFAULT_MODEL_STORAGE_KEY, modelKey);
    } catch {
      /* ignore */
    }
  }, []);

  const {
    messages,
    chatId,
    isLoading,
    isChatLoading,
    streamPhase,
    handleSendMessage,
    regenerateMessage,
    retryFailedMessage,
    editAndResend,
    continueGenerating,
    stopGenerating,
    clearMessages,
    setChatId,
    loadChat,
    setMessages,
    appendToLastMessage,
    replaceLastMessageContent,
    finalizeLastMessage,
  } = useChat({
    projectId: activeProjectId,
    onFirstMessagePersisted: handleFirstMessagePersisted,
    preferWebSearchRef,
    selectedModelRef,
    onGateDenial: handleGateDenial,
  });

  const {
    enabled: deepResearchEnabled,
    setEnabled: setDeepResearchEnabled,
    webSearchEnabled,
    setWebSearchEnabled,
    state: researchState,
    isRunning: isResearchRunning,
    panelOpen: researchPanelOpen,
    setPanelOpen: setResearchPanelOpen,
    interruptedSessionId,
    run: runResearch,
    stop: stopResearch,
    resumeInterrupted,
    clear: clearResearch,
  } = useDeepResearch({
    chatId,
    projectId: activeProjectId,
    onChatId: (id) => {
      setChatId(id);
      void refreshChatHistory();
    },
    onDelta: (text) => appendToLastMessage(text),
    onComplete: (report, _chatId, meta) => {
      if (!report) return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          const confidencePct =
            typeof meta?.confidence === 'number'
              ? ` · Confidence ${Math.round(meta.confidence * 100)}%`
              : '';
          next[next.length - 1] = {
            ...last,
            content: report.startsWith('*Deep Research')
              ? report
              : `*Deep Research report${confidencePct}*\n\n${report}`,
            isStreaming: false,
          };
        }
        return next;
      });
    },
    onError: notifyError,
    onGateDenial: handleGateDenial,
  });

  useEffect(() => {
    preferWebSearchRef.current = webSearchEnabled;
  }, [webSearchEnabled]);

  const {
    run: browserRun,
    activeApproval: browserApproval,
    previewUrl: browserPreviewUrl,
    panelOpen: browserPanelOpen,
    setPanelOpen: setBrowserPanelOpen,
    isActive: isBrowserActive,
    isStarting: isBrowserStarting,
    error: browserError,
    start: startBrowser,
    pause: pauseBrowser,
    resume: resumeBrowser,
    stop: stopBrowser,
    resolveApproval: resolveBrowserApproval,
  } = useBrowser({
    enabled: true,
    onError: notifyError,
    onGateDenial: handleGateDenial,
  });

  const {
    panelOpen: codePanelOpen,
    setPanelOpen: setCodePanelOpen,
    session: codeSession,
    code: codeSource,
    setCode: setCodeSource,
    stdout: codeStdout,
    stderr: codeStderr,
    error: codeError,
    isRunning: isCodeRunning,
    isStarting: isCodeStarting,
    uploadProgress: codeUploadProgress,
    files: codeFiles,
    plots: codePlots,
    run: runCode,
    interrupt: interruptCode,
    restart: restartCode,
    upload: uploadCodeFile,
    publishCanvas: publishCodeCanvas,
    closeSession: closeCodeSession,
    fileUrl: codeFileUrl,
    openPanel: openCodePanel,
  } = useCodeInterpreter({
    enabled: true,
    onError: notifyError,
    onGateDenial: handleGateDenial,
  });

  const {
    agents: agentTypes,
    selectedAgent,
    selectAgent,
    isAgentMode,
    executor: agentExecutor,
    isRunning: isAgentRunning,
    timelineOpen: agentTimelineOpen,
    setTimelineOpen: setAgentTimelineOpen,
    run: runAgent,
    cancel: cancelAgent,
    retry: retryAgent,
    clearExecution: clearAgentExecution,
  } = useAgent({
    chatId,
    projectId: activeProjectId,
    onChatId: (id) => {
      setChatId(id);
      void refreshChatHistory();
    },
    onDelta: (text, meta) => {
      if (meta?.replace) replaceLastMessageContent(text);
      else appendToLastMessage(text);
    },
    onError: notifyError,
    onGateDenial: handleGateDenial,
  });

  const selectedAgentInfo =
    agentTypes.find((a) => a.id === selectedAgent) || null;

  // Reset agent / research chrome when starting a fresh conversation.
  const clearMessagesAndAgent = useCallback(() => {
    clearAgentExecution();
    clearResearch();
    clearMessages();
  }, [clearAgentExecution, clearResearch, clearMessages]);

  const handleSendWithOptionalAgent = useCallback(
    async (content: string, attachments?: MessageAttachment[]) => {
      stickToBottomRef.current = true;

      // Deep Research — multi-phase investigation pipeline.
      if (deepResearchEnabled) {
        if (!content.trim()) return;

        const isFirstMessage = messages.length === 0;
        const userMessage = {
          id: Date.now().toString(),
          role: 'user' as const,
          content: content.trim(),
          attachments,
        };
        const placeholder = {
          id: (Date.now() + 1).toString(),
          role: 'assistant' as const,
          content: '',
          isStreaming: true,
        };
        setMessages([...messages, userMessage, placeholder]);

        const result = await runResearch(content.trim(), { chatId });
        finalizeLastMessage();

        if (result?.chatId && isFirstMessage) {
          void handleFirstMessagePersisted(result.chatId, content.trim());
        }
        return;
      }

      // Default path — existing chat loop untouched.
      if (!isAgentMode || !selectedAgent) {
        return handleSendMessage(content, attachments);
      }

      const hasAttachments = !!attachments?.length;
      if (!content.trim() && !hasAttachments) return;

      const isFirstMessage = messages.length === 0;
      const userMessage = {
        id: Date.now().toString(),
        role: 'user' as const,
        content: content.trim(),
        attachments,
      };
      const streamingId = (Date.now() + 1).toString();
      const placeholder = {
        id: streamingId,
        role: 'assistant' as const,
        content: '',
        isStreaming: true,
      };

      const history = [...messages, userMessage];
      setMessages([...history, placeholder]);

      const result = await runAgent({
        message: content.trim() || attachments?.[0]?.name || 'Analyze attached files',
        messages: history.map((m) => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments,
        })),
        fileIds: attachments
          ?.map((a) => a.fileId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
        attachments,
        chatId: chatId || undefined,
        projectId: activeProjectId || undefined,
      });

      finalizeLastMessage();

      if (result?.chatId && isFirstMessage) {
        const titleSource = content.trim() || attachments?.[0]?.name || '';
        void handleFirstMessagePersisted(result.chatId, titleSource);
      }
    },
    [
      deepResearchEnabled,
      runResearch,
      isAgentMode,
      selectedAgent,
      handleSendMessage,
      messages,
      setMessages,
      runAgent,
      finalizeLastMessage,
      chatId,
      activeProjectId,
      handleFirstMessagePersisted,
    ]
  );

  const handleStopOrCancel = useCallback(() => {
    if (isResearchRunning) {
      void stopResearch();
      finalizeLastMessage();
      return;
    }
    if (isAgentRunning) {
      void cancelAgent();
      finalizeLastMessage();
      return;
    }
    stopGenerating();
  }, [
    isResearchRunning,
    stopResearch,
    isAgentRunning,
    cancelAgent,
    finalizeLastMessage,
    stopGenerating,
  ]);

  const {
    isOpen: isCanvasOpen,
    isFullscreen: isCanvasFullscreen,
    setIsFullscreen: setCanvasFullscreen,
    panelWidth: canvasPanelWidth,
    setPanelWidth: setCanvasPanelWidth,
    mobileSurface: canvasMobileSurface,
    openTabs: canvasTabs,
    activeId: activeCanvasId,
    setActiveId: setActiveCanvasId,
    drafts: canvasDrafts,
    titles: canvasTitles,
    saveStatus: canvasSaveStatus,
    viewMode: canvasViewMode,
    conflicts: canvasConflicts,
    versions: canvasVersions,
    diffBaseline: canvasDiffBaseline,
    isAiBusy: isCanvasAiBusy,
    closePanel: closeCanvasPanel,
    resetCanvasState,
    createAndOpen: createCanvasAndOpen,
    openFromArtifact,
    openFromMessageContent,
    handleAssistantContent,
    flushAutosave: flushCanvasAutosave,
    isDirty: isCanvasDirty,
    closeTab: closeCanvasTab,
    rename: renameCanvasTab,
    duplicate: duplicateCanvasTab,
    togglePin: toggleCanvasPin,
    setDraftContent,
    setDraftTitle,
    discardDraftChanges,
    setMode: setCanvasMode,
    resolveConflict: resolveCanvasConflict,
    runAiEdit,
    loadVersions: loadCanvasVersions,
    restoreVersion: restoreCanvasVersion,
    loadDiffAgainstVersion,
    showChatSurface: showCanvasChatSurface,
    showCanvasSurface,
  } = useCanvas({
    chatId,
    onError: notifyError,
    onGateDenial: handleGateDenial,
  });

  const {
    activeTab: workspaceTab,
    selectTab: selectWorkspaceTab,
    contextOpen,
    contextSurface,
    openContext,
    closeContext,
    toggleContext,
  } = useWorkspace({
    isCanvasOpen,
    deepResearchEnabled,
  });

  const memoryPreview = useMemory({ enabled: contextOpen || workspaceTab === 'memory' });
  const mainFiles = useProjectFiles(
    workspaceTab === 'files' ? activeProjectId : null
  );

  const chatInputRef = useRef<ChatInputHandle>(null);
  const [dropOverlayOpen, setDropOverlayOpen] = useState(false);
  const pendingDropFilesRef = useRef<FileList | null>(null);
  const pageDragDepthRef = useRef(0);

  // Voice Live Mode is isolated in VoiceModeHost so waveform / transcript ticks
  // never re-render the chat shell or message list.
  const openVoiceImplRef = useRef<(() => void) | null>(null);
  const pendingOpenVoiceRef = useRef(false);
  const [voiceLive, setVoiceLive] = useState(false);
  const [voiceMinimizeSignal, setVoiceMinimizeSignal] = useState(0);
  const registerOpenVoice = useCallback((open: () => void) => {
    openVoiceImplRef.current = open;
    if (pendingOpenVoiceRef.current) {
      pendingOpenVoiceRef.current = false;
      open();
    }
  }, []);
  const openVoiceMode = useCallback(() => {
    if (openVoiceImplRef.current) {
      openVoiceImplRef.current();
      return;
    }
    pendingOpenVoiceRef.current = true;
  }, []);
  const handleVoiceLiveChange = useCallback((live: boolean) => {
    setVoiceLive(live);
  }, []);

  // Navigating to another workspace surface collapses Live UI to the floating orb
  // without ending the call — mic / TTS keep running.
  const prevWorkspaceTabRef = useRef(workspaceTab);
  useEffect(() => {
    if (prevWorkspaceTabRef.current === workspaceTab) return;
    prevWorkspaceTabRef.current = workspaceTab;
    if (voiceLive) {
      setVoiceMinimizeSignal((n) => n + 1);
    }
  }, [workspaceTab, voiceLive]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLElement>(null);
  // Floating composer overlays the scroll pane — keep dynamic clearance so the
  // last message never renders underneath the input (incl. multiline growth).
  // Always leave ≥120px breathing room above the composer.
  const [composerHeight, setComposerHeight] = useState(0);
  const handleComposerHeightChange = useCallback((height: number) => {
    setComposerHeight((prev) => (Math.abs(prev - height) < 0.5 ? prev : height));
  }, []);
  const isDesktop = useIsDesktop();
  const { keyboardInset } = useVisualViewport();
  const mobileKeyboardInset = !isDesktop ? keyboardInset : 0;
  const messagesBottomInset =
    workspaceTab === 'automation'
      ? 32
      : Math.max(composerHeight > 0 ? composerHeight : 58, 58) +
        (!isDesktop
          ? 48 + Math.max(mobileKeyboardInset, 0)
          : 160 + mobileKeyboardInset);

  const stickToBottomRef = useRef(true);
  const {
    activeMessageId: ttsMessageId,
    ttsState,
    paragraphIndex: ttsParagraphIndex,
    play: playTts,
    pause: pauseTts,
    resume: resumeTts,
    stop: stopTts,
  } = useMessageTts({
    onError: notifyError,
  });

  const handleRegenerate = useCallback(
    (messageId: string) => {
      stopTts();
      void regenerateMessage(messageId);
    },
    [regenerateMessage, stopTts]
  );

  const handleRetry = useCallback(
    (messageId: string) => {
      stopTts();
      void retryFailedMessage(messageId);
    },
    [retryFailedMessage, stopTts]
  );

  const handleEditAndResend = useCallback(
    (messageId: string, newContent: string) => {
      stopTts();
      void editAndResend(messageId, newContent);
    },
    [editAndResend, stopTts]
  );

  const handleMessageFeedback = useCallback(
    (messageId: string, value: 'up' | 'down' | null) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: value } : m))
      );
    },
    [setMessages]
  );

  const rememberChatScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    const id = chatIdRef.current;
    if (el && id) scrollPositionsRef.current.set(id, el.scrollTop);
  }, []);

  /** Pending mobile confirmation before mounting Canvas. */
  const [canvasConfirm, setCanvasConfirm] = useState<
    | { source: 'message'; content: string; title?: string }
    | { source: 'artifact'; artifact: Artifact }
    | null
  >(null);

  const restoreChatScrollAfterCanvas = useCallback(() => {
    const id = chatIdRef.current;
    requestAnimationFrame(() => {
      const el = messagesContainerRef.current;
      if (!el || !id) return;
      const saved = scrollPositionsRef.current.get(id);
      if (saved != null) {
        const prev = el.style.scrollBehavior;
        el.style.scrollBehavior = 'auto';
        el.scrollTop = saved;
        el.style.scrollBehavior = prev;
      }
    });
  }, []);

  const handleCloseCanvasPanel = useCallback(() => {
    closeCanvasPanel();
    restoreChatScrollAfterCanvas();
  }, [closeCanvasPanel, restoreChatScrollAfterCanvas]);

  const handleOpenInCanvas = useCallback(
    (_messageId: string, content: string) => {
      rememberChatScroll();
      // Mobile: confirm via bottom sheet, then full-screen Canvas.
      // Desktop: open the resizable side panel immediately.
      if (!isDesktop) {
        setCanvasConfirm({ source: 'message', content });
        return;
      }
      void openFromMessageContent(content);
    },
    [isDesktop, openFromMessageContent, rememberChatScroll]
  );

  const handleConfirmOpenCanvas = useCallback(() => {
    if (!canvasConfirm) return;
    const pending = canvasConfirm;
    setCanvasConfirm(null);
    rememberChatScroll();
    if (pending.source === 'artifact') {
      void openFromArtifact(pending.artifact);
      return;
    }
    void openFromMessageContent(pending.content, pending.title);
  }, [
    canvasConfirm,
    openFromArtifact,
    openFromMessageContent,
    rememberChatScroll,
  ]);

  const handleCancelOpenCanvas = useCallback(() => {
    setCanvasConfirm(null);
  }, []);

  const handleShareMessage = useCallback(
    async (_messageId: string, content: string) => {
      const text = content.trim();
      if (!text) return;
      try {
        if (navigator.share) {
          await navigator.share({ text });
        } else {
          await navigator.clipboard.writeText(text);
          showToast('Copied to clipboard', 'success');
        }
      } catch {
        /* cancelled */
      }
    },
    [showToast]
  );

  const handlePinMessage = useCallback(
    (messageId: string) => {
      let pinnedNow = false;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          pinnedNow = !m.pinned;
          return { ...m, pinned: pinnedNow };
        })
      );
      showToast(pinnedNow ? 'Message pinned' : 'Message unpinned', 'success');
    },
    [setMessages, showToast]
  );

  const handleSaveResponse = useCallback(
    (messageId: string, content: string) => {
      try {
        const key = 'vani.savedResponses';
        const existing = JSON.parse(window.localStorage.getItem(key) || '[]') as unknown[];
        const entry = {
          id: messageId,
          content,
          savedAt: new Date().toISOString(),
          chatId: chatIdRef.current,
        };
        window.localStorage.setItem(key, JSON.stringify([entry, ...existing].slice(0, 50)));
        showToast('Response saved', 'success');
      } catch {
        showToast("Couldn't save response", 'error');
      }
    },
    [showToast]
  );

  const handleExportMessageMarkdown = useCallback(
    (_messageId: string, content: string) => {
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vani-response.md';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Markdown exported', 'success');
    },
    [showToast]
  );

  const handleExportMessagePdf = useCallback(
    async (_messageId: string, content: string) => {
      try {
        const { exportCanvas } = await import('@/lib/canvas/export');
        await exportCanvas(
          {
            id: 'message-export',
            userId: '',
            title: 'VANI Response',
            type: 'markdown',
            content,
            language: 'markdown',
            revision: 1,
            pinned: false,
            chatId: chatIdRef.current,
            sourceArtifactId: null,
            closedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          'pdf'
        );
        showToast('PDF exported', 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Couldn't export PDF", 'error');
      }
    },
    [showToast]
  );

  const handleDeleteResponse = useCallback(
    async (messageId: string) => {
      const ok = await confirm({
        title: 'Delete response?',
        description: 'This removes the reply from this conversation on this device.',
        confirmLabel: 'Delete',
        variant: 'danger',
      });
      if (!ok) return;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      showToast('Response deleted', 'success');
    },
    [confirm, setMessages, showToast]
  );

  const handleContinue = useCallback(
    (messageId: string) => {
      stopTts();
      void continueGenerating(messageId);
    },
    [continueGenerating, stopTts]
  );

  const handleReadAloud = useCallback(
    (messageId: string, content: string) => {
      if (ttsMessageId === messageId && ttsState === 'paused') {
        void resumeTts();
        return;
      }
      void playTts(messageId, content);
    },
    [ttsMessageId, ttsState, playTts, resumeTts]
  );

  // Sidebar list stays in sync the moment a brand-new chat is persisted
  // server-side (chatId flips from null -> an id on the first message of a
  // fresh conversation). Existing-chat sends don't need this — their row
  // already exists in the list. Temp ids (pending "New Chat" creations) are
  // excluded since they're already reflected in the list optimistically and
  // a refresh here would race the create request and drop the placeholder.
  const previousChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    const justCreated = !previousChatIdRef.current && !!chatId && !isTempChatId(chatId);
    previousChatIdRef.current = chatId;
    if (justCreated) void refreshChatHistory();
  }, [chatId, refreshChatHistory]);

  // Each Message detects its own artifacts (memoized to its own content) and
  // reports them up here via an effect, so unrelated messages never
  // recompute or re-render just because another message is streaming.
  const [artifactsByMessage, setArtifactsByMessage] = useState<Record<string, Artifact[]>>({});
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [isArtifactPanelOpen, setIsArtifactPanelOpen] = useState(false);
  const [isArtifactFullscreen, setIsArtifactFullscreen] = useState(false);
  // On narrow screens chat + artifact can't share the row — this picks which
  // surface is visible. Desktop keeps both side-by-side when the panel is open.
  // Canvas owns its own mobileSurface; artifact keeps a local one for fallback.
  const [mobileSurface, setMobileSurface] = useState<'chat' | 'artifact'>('chat');

  // Artifacts (and the panel showing them) belong to a single conversation —
  // switching threads must never leave a stale panel from the old one open.
  const resetArtifactState = useCallback(() => {
    setArtifactsByMessage({});
    setActiveArtifactId(null);
    setIsArtifactPanelOpen(false);
    setIsArtifactFullscreen(false);
    setMobileSurface('chat');
    resetCanvasState();
  }, [resetCanvasState]);

  const focusComposer = useCallback(() => {
    // Composer may remount when empty-home layout flips — focus after paint.
    requestAnimationFrame(() => {
      chatInputRef.current?.focus();
      window.setTimeout(() => chatInputRef.current?.focus(), 40);
    });
  }, []);

  // New Chat: only create when the current thread already has a user message.
  // Empty / brand-new chats stay selected — no duplicate empty conversations.
  // `force` is used after deleting the active chat so a fresh thread still opens.
  const handleNewChat = useCallback(async (opts?: { force?: boolean }) => {
    const hasUserMessage = messages.some((m) => m.role === 'user');
    if (!opts?.force && !hasUserMessage) {
      focusComposer();
      return;
    }

    clearMessagesAndAgent();
    resetArtifactState();

    const tempId = `${TEMP_CHAT_PREFIX}${Date.now()}`;
    const optimisticChat: ChatSummary = {
      id: tempId,
      title: 'New Chat',
      updatedAt: new Date().toISOString(),
      project: activeProjectId,
    };
    addOptimisticChat(optimisticChat);
    setChatId(tempId);

    try {
      const created = await createChatOnServer({ projectId: activeProjectId });
      replaceChat(tempId, created);
      setChatId((current) => (current === tempId ? created.id : current));
      focusComposer();
    } catch (err) {
      removeChat(tempId);
      setChatId((current) => (current === tempId ? null : current));
      showToast((err as Error).message || "Couldn't create a new chat. Please try again.", 'error');
    }
  }, [messages, focusComposer, clearMessagesAndAgent, resetArtifactState, addOptimisticChat, activeProjectId, setChatId, createChatOnServer, replaceChat, removeChat, showToast]);

  // Rename: applied to the sidebar immediately (optimistic), persisted via
  // PATCH /api/chat/:id/title, and rolled back to the exact previous title
  // if the request fails. Inline editing (Enter/Escape) lives in
  // ChatHistoryItem — this is just the save/rollback side of it.
  const handleRenameChat = useCallback(
    async (id: string, newTitle: string) => {
      const previousTitle =
        recentChats.find((c) => c.id === id)?.title ??
        projectChats.find((c) => c.id === id)?.title;

      updateChatTitle(id, newTitle);
      updateProjectChatTitle(id, newTitle);

      try {
        await saveTitle(id, newTitle);
      } catch (err) {
        if (previousTitle !== undefined) {
          updateChatTitle(id, previousTitle);
          updateProjectChatTitle(id, previousTitle);
        }
        showToast((err as Error).message || "Couldn't rename chat. Please try again.", 'error');
      }
    },
    [recentChats, projectChats, updateChatTitle, updateProjectChatTitle, saveTitle, showToast]
  );

  // Delete: confirm -> remove from the sidebar immediately (optimistic) ->
  // persist via DELETE /api/chat/:id. If the deleted chat is the one
  // currently open, a fresh empty chat is opened right away too (reusing
  // the exact same New Chat flow, so it stays consistent everywhere). On
  // failure, the row is reinserted at its original position and the user
  // is notified — they're simply left on the new/empty chat rather than
  // being yanked back into the one that failed to delete.
  const handleDeleteChat = useCallback(
    async (id: string) => {
      const index = recentChats.findIndex((c) => c.id === id);
      const chatToDelete = index !== -1 ? recentChats[index] : undefined;

      const confirmed = await confirm({
        title: 'Delete conversation?',
        description:
          'This conversation will be permanently deleted.\nThis action cannot be undone.',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        variant: 'danger',
      });
      if (!confirmed) return;

      removeChat(id);
      if (activeProjectId) {
        void refreshProjectChats(activeProjectId);
      }
      if (chatId === id) void handleNewChat({ force: true });

      try {
        await deleteChatOnServer(id);
        if (activeProjectId) {
          void refreshProjectChats(activeProjectId);
        }
        showToast('Chat deleted', 'success');
      } catch (err) {
        if (chatToDelete) insertChatAt(index, chatToDelete);
        if (activeProjectId) {
          void refreshProjectChats(activeProjectId);
        }
        showToast(err instanceof Error ? err.message : "Couldn't delete chat", 'error');
      }
    },
    [recentChats, confirm, removeChat, chatId, handleNewChat, deleteChatOnServer, insertChatAt, showToast, activeProjectId, refreshProjectChats]
  );

  // Pin/unpin: applied to the sidebar immediately (optimistic, and
  // re-sorted so pinned chats float to the top right away), persisted via
  // POST /api/chat/:id/pin|unpin, and reverted on failure.
  const handlePinChat = useCallback(
    async (id: string, pinned: boolean) => {
      const previousPinned = recentChats.find((c) => c.id === id)?.pinned ?? false;

      updateChatPinned(id, pinned);

      try {
        await setChatPinned(id, pinned);
        showToast(pinned ? 'Chat pinned' : 'Chat unpinned', 'success');
      } catch (err) {
        updateChatPinned(id, previousPinned);
        showToast(err instanceof Error ? err.message : "Couldn't update pin", 'error');
      }
    },
    [recentChats, updateChatPinned, setChatPinned, showToast]
  );

  const chatIdRef = useRef(chatId);
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleArtifactsDetected = useCallback(
    (messageId: string, artifacts: Artifact[]) => {
      setArtifactsByMessage((prev) =>
        prev[messageId] === artifacts ? prev : { ...prev, [messageId]: artifacts }
      );

      const message = messagesRef.current.find((m) => m.id === messageId);
      void handleAssistantContent(messageId, message?.content ?? '', artifacts);
    },
    [handleAssistantContent]
  );

  const handleForgetMemory = useCallback(
    async (content: string) => {
      const ok = await confirm({
        title: 'Forget this?',
        description: 'VANI will remove any saved memories that match this message.',
        confirmLabel: 'Forget',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        const result = await forgetMemory({
          content,
          chatId: chatIdRef.current,
        });
        showToast(
          result.deleted ? 'Related memories forgotten' : 'No matching memories found',
          result.deleted ? 'success' : 'info'
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Couldn't forget memories", 'error');
      }
    },
    [confirm, showToast]
  );

  const allArtifacts = useMemo(
    () => Object.values(artifactsByMessage).flat(),
    [artifactsByMessage]
  );

  const activeArtifact = useMemo(
    () => allArtifacts.find((a) => a.id === activeArtifactId) ?? null,
    [allArtifacts, activeArtifactId]
  );

  // Artifact cards open into Canvas (hybrid workspace). ArtifactPanel remains
  // available as a fallback when Canvas is closed and the user reopens via header.
  const handleOpenArtifact = useCallback(
    (id: string) => {
      const artifact = allArtifacts.find((a) => a.id === id);
      setActiveArtifactId(id);
      if (artifact) {
        rememberChatScroll();
        // On mobile, confirm first — never drop users into an editor unexpectedly.
        if (!isDesktop) {
          setCanvasConfirm({ source: 'artifact', artifact });
          return;
        }
        void openFromArtifact(artifact).then((doc) => {
          if (!doc) {
            setIsArtifactPanelOpen(true);
            setMobileSurface('artifact');
          }
        });
        return;
      }
      setIsArtifactPanelOpen(true);
      setMobileSurface('artifact');
    },
    [allArtifacts, isDesktop, openFromArtifact, rememberChatScroll]
  );

  const handleCloseArtifactPanel = useCallback(() => {
    setIsArtifactPanelOpen(false);
    setIsArtifactFullscreen(false);
    setMobileSurface('chat');
  }, []);

  const handleShowChatSurface = useCallback(() => {
    setMobileSurface('chat');
    showCanvasChatSurface();
  }, [showCanvasChatSurface]);

  const handleShowArtifactSurface = useCallback(() => {
    if (!activeArtifactId && allArtifacts[0]) {
      setActiveArtifactId(allArtifacts[0].id);
    }
    const artifact =
      allArtifacts.find((a) => a.id === activeArtifactId) ?? allArtifacts[0] ?? null;
    if (artifact) {
      void openFromArtifact(artifact).then((doc) => {
        if (!doc) {
          setIsArtifactPanelOpen(true);
          setMobileSurface('artifact');
        }
      });
      return;
    }
    setIsArtifactPanelOpen(true);
    setMobileSurface('artifact');
  }, [activeArtifactId, allArtifacts, openFromArtifact]);

  const handleToggleFullscreen = useCallback(() => {
    setIsArtifactFullscreen((v) => !v);
  }, []);


  // Sidebar shows the target chat highlighted the instant it's clicked,
  // before GET /api/chat/:id resolves — falls back to the confirmed chatId
  // once loading settles (success or failure).
  const [pendingChatId, setPendingChatId] = useState<string | null>(null);
  const highlightedChatId = pendingChatId ?? chatId;

  // Drives the export menu's filename/heading — looked up from whichever
  // sidebar list the active chat currently lives in.
  const activeConversationTitle = useMemo(() => {
    const source = activeProjectId ? projectChats : recentChats;
    return source.find((c) => c.id === highlightedChatId)?.title || 'Conversation';
  }, [activeProjectId, projectChats, recentChats, highlightedChatId]);

  // Sharing requires a real, server-persisted chat id — hide it behind the
  // still-pending optimistic id ("temp-...") a brand-new chat starts with.
  const shareableChatId = isTempChatId(chatId) ? null : chatId;

  // Per-chat scroll offsets so switching away and back restores exactly
  // where the user left off, keyed by chatId. `activeChatIdRef` lets the
  // scroll listener always read the latest id without re-binding itself.
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const activeChatIdRef = useRef<string | null>(chatId);
  // Set right before a history load swaps `messages` in, so the scroll
  // effect below knows to jump (not smooth-scroll) to the restored offset.
  const pendingScrollRestoreRef = useRef<string | null>(null);

  useEffect(() => {
    activeChatIdRef.current = chatId;
  }, [chatId]);

  const handleMessagesScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    const el = event.currentTarget;
    const id = activeChatIdRef.current;
    if (id) scrollPositionsRef.current.set(id, el.scrollTop);
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < Math.max(140, messagesBottomInset * 0.35);
  }, [messagesBottomInset]);

  // Loading a conversation: fetches full history, restores its remembered
  // scroll position (or jumps to the latest message the first time it's
  // opened), and resets artifact UI so nothing bleeds in from the previous
  // thread. useChat/loadChat already invalidates any in-flight stream for
  // the chat being left, so a straggling delta can't corrupt this one.
  const handleSelectChat = useCallback(
    async (id: string) => {
      if (id === chatId || id === pendingChatId) return;

      clearAgentExecution();
      clearResearch();
      stopTts();

      const container = messagesContainerRef.current;
      if (chatId && container) {
        scrollPositionsRef.current.set(chatId, container.scrollTop);
      }

      setPendingChatId(id);
      resetArtifactState();
      pendingScrollRestoreRef.current = id;
      stickToBottomRef.current = true;

      try {
        await loadChat(id);
      } catch (err) {
        pendingScrollRestoreRef.current = null;
        showToast((err as Error).message || "Couldn't load this conversation. Please try again.", 'error');
      } finally {
        setPendingChatId(null);
      }
    },
    [chatId, pendingChatId, loadChat, resetArtifactState, showToast, clearAgentExecution, clearResearch, stopTts]
  );

  // Single scroll owner for the message pane:
  //  - a pending chat-history load restores instantly (no CSS smooth-scroll
  //    animation sliding through the whole thread);
  //  - streaming / new messages only follow when the user is near the bottom.
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const restoreTargetId = pendingScrollRestoreRef.current;
    if (restoreTargetId) {
      pendingScrollRestoreRef.current = null;
      const previousBehavior = container.style.scrollBehavior;
      container.style.scrollBehavior = 'auto';
      container.scrollTop = scrollPositionsRef.current.get(restoreTargetId) ?? container.scrollHeight;
      container.style.scrollBehavior = previousBehavior;
      stickToBottomRef.current = true;
      return;
    }

    if (!stickToBottomRef.current) return;

    // Instant while streaming (avoids janky smooth-scroll fights); smooth for settled turns.
    const behavior: ScrollBehavior = isLoading || isAgentRunning || isResearchRunning ? 'auto' : 'smooth';
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, [messages, isLoading, isAgentRunning, isResearchRunning, agentExecutor.progress, researchState.progress]);

  // When the composer grows/shrinks (multiline, attachments), keep a bottom-pinned
  // thread clear of the overlay without fighting a restored mid-thread position.
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || composerHeight <= 0) return;
    if (pendingScrollRestoreRef.current) return;
    if (!stickToBottomRef.current) return;

    container.scrollTop = container.scrollHeight;
  }, [composerHeight, messagesBottomInset]);

  // Soft-keyboard open/close — re-pin to bottom so the latest turn stays visible.
  const prevKeyboardInsetRef = useRef(0);
  useLayoutEffect(() => {
    if (isDesktop) return;
    const prev = prevKeyboardInsetRef.current;
    prevKeyboardInsetRef.current = mobileKeyboardInset;
    if (mobileKeyboardInset === prev) return;
    if (!stickToBottomRef.current) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    // Instant jump avoids fighting iOS visualViewport animation.
    container.scrollTop = container.scrollHeight;
  }, [mobileKeyboardInset, isDesktop]);

  const onSuggestionClick = useCallback(
    (text: string) => {
      void handleSendWithOptionalAgent(text);
    },
    [handleSendWithOptionalAgent]
  );

  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const openSidebar = useCallback(() => setIsSidebarOpen(true), []);
  const toggleSidebarCollapsed = useCallback(
    () => setIsSidebarCollapsed((v) => !v),
    []
  );
  const handleToggleSidebar = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen((v) => !v);
      return;
    }
    setIsSidebarCollapsed((v) => !v);
  }, []);

  /** Left-edge swipe → open mobile drawer (ChatGPT/Gemini pattern). */
  const edgeSwipeRef = useRef<{
    startX: number;
    startY: number;
    tracking: boolean;
  } | null>(null);
  const onEdgePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    edgeSwipeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      tracking: true,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onEdgePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = edgeSwipeRef.current;
      if (!s?.tracking) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) {
        s.tracking = false;
        return;
      }
      if (dx > 48) {
        s.tracking = false;
        openSidebar();
      }
    },
    [openSidebar]
  );
  const onEdgePointerUp = useCallback(() => {
    edgeSwipeRef.current = null;
  }, []);
  const openMemory = useCallback(() => setIsMemoryOpen(true), []);
  const closeMemory = useCallback(() => setIsMemoryOpen(false), []);
  const closeMcpSettings = useCallback(() => setIsMcpSettingsOpen(false), []);
  const openBillingSettings = useCallback(
    (section: typeof settingsSection = 'general') => {
      setSettingsSection(section);
      setIsBillingOpen(true);
    },
    []
  );
  const closeBillingSettings = useCallback(() => setIsBillingOpen(false), []);
  const openAgentsSettings = useCallback(() => openBillingSettings('general'), [openBillingSettings]);
  const openBillingTab = useCallback(() => openBillingSettings('billing'), [openBillingSettings]);

  /** Selecting an agent/mode must not bury the conversation behind canvas/artifact on mobile. */
  const handleSelectAgent = useCallback(
    (id: Parameters<typeof selectAgent>[0]) => {
      selectAgent(id);
      selectWorkspaceTab('chat');
      setMobileSurface('chat');
      if (isCanvasOpen) showCanvasChatSurface();
    },
    [selectAgent, selectWorkspaceTab, isCanvasOpen, showCanvasChatSurface]
  );

  const openAnalytics = useCallback(() => setIsAnalyticsOpen(true), []);
  const closeAnalytics = useCallback(() => setIsAnalyticsOpen(false), []);
  const openAiDashboard = useCallback(() => setIsAiDashboardOpen(true), []);
  const closeAiDashboard = useCallback(() => setIsAiDashboardOpen(false), []);
  const openAdminDashboard = useCallback(() => {
    setIsAnalyticsOpen(false);
    setIsAdminDashboardOpen(true);
  }, []);

  const handleOpenKnowledge = useCallback(() => {
    selectWorkspaceTab('files');
    openContext('files');
    if (!activeProjectId) {
      showToast('Select a project to manage knowledge files', 'info');
    }
  }, [selectWorkspaceTab, openContext, activeProjectId, showToast]);

  const handleOpenImages = useCallback(() => {
    void handleSendWithOptionalAgent(
      'Create a beautiful image — ask me what subject, style, and mood I want.'
    );
  }, [handleSendWithOptionalAgent]);

  const handleOpenResearchWorkspace = useCallback(() => {
    setDeepResearchEnabled(true);
    selectWorkspaceTab('research');
    openContext('research');
    setResearchPanelOpen(true);
    showToast('Deep research enabled — ask a research question', 'success');
  }, [
    setDeepResearchEnabled,
    selectWorkspaceTab,
    openContext,
    setResearchPanelOpen,
    showToast,
  ]);

  const handleWorkspaceTabChange = useCallback(
    (tab: WorkspaceTab) => {
      selectWorkspaceTab(tab);
      if (tab === 'chat') {
        showCanvasChatSurface();
        return;
      }
      if (tab === 'canvas') {
        if (!isCanvasOpen || canvasTabs.length === 0) {
          void createCanvasAndOpen({ type: 'markdown', title: 'Untitled' });
        } else {
          showCanvasSurface();
        }
        openContext('canvas');
        return;
      }
      if (tab === 'research') {
        setDeepResearchEnabled(true);
        setResearchPanelOpen(true);
        openContext('research');
        return;
      }
      if (tab === 'memory') {
        openMemory();
        selectWorkspaceTab('chat');
        return;
      }
      if (tab === 'files') {
        openContext('files');
        return;
      }
      if (tab === 'tasks') {
        selectWorkspaceTab('chat');
        return;
      }
      if (tab === 'automation') {
        selectAgent('web');
        openContext('automation');
        if (browserRun) setBrowserPanelOpen(true);
      }
    },
    [
      selectWorkspaceTab,
      showCanvasChatSurface,
      isCanvasOpen,
      canvasTabs.length,
      createCanvasAndOpen,
      showCanvasSurface,
      openContext,
      setDeepResearchEnabled,
      setResearchPanelOpen,
      selectAgent,
      browserRun,
      setBrowserPanelOpen,
      openMemory,
    ]
  );

  const handleProjectWorkspaceNav = useCallback(
    (dest: string) => {
      if (dest === 'knowledge' || dest === 'files') {
        handleWorkspaceTabChange('files');
        return;
      }
      if (dest === 'chat') {
        handleWorkspaceTabChange('chat');
      }
    },
    [handleWorkspaceTabChange]
  );

  const handleFilesDropped = useCallback((files: FileList) => {
    pendingDropFilesRef.current = files;
    setDropOverlayOpen(true);
  }, []);

  const handleDropAction = useCallback(
    async (action: DropActionId) => {
      const files = pendingDropFilesRef.current;
      setDropOverlayOpen(false);
      pendingDropFilesRef.current = null;
      if (!files?.length) return;

      if (action === 'attach' || action === 'image') {
        chatInputRef.current?.ingestFiles(files, 'drop');
        return;
      }

      const first = files[0];
      if (action === 'knowledge') {
        if (!activeProjectId) {
          showToast('Select a project first', 'info');
          return;
        }
        try {
          for (const file of Array.from(files)) {
            const kind = getAttachmentKind(file);
            const mimeType = resolveMimeType(file, kind);
            const dataBase64 = await readFileAsBase64(file, () => {});
            await uploadKnowledgeFile(activeProjectId, {
              name: file.name,
              mimeType,
              size: file.size,
              kind,
              dataBase64,
            });
          }
          showToast('Added to project knowledge', 'success');
          handleWorkspaceTabChange('files');
          mainFiles.refresh();
        } catch (err) {
          showToast(
            err instanceof Error ? err.message : "Couldn't add to project knowledge",
            'error'
          );
        }
        return;
      }

      if (action === 'summarize') {
        chatInputRef.current?.ingestFiles(files, 'drop');
        void handleSendWithOptionalAgent(
          `Summarize the attached file “${first.name}” with key points and action items.`
        );
        return;
      }

      if (action === 'research') {
        setDeepResearchEnabled(true);
        chatInputRef.current?.ingestFiles(files, 'drop');
        void handleSendWithOptionalAgent(
          `Run deep research using “${first.name}” as context. Extract claims and find supporting sources.`
        );
        handleWorkspaceTabChange('research');
      }
    },
    [
      activeProjectId,
      showToast,
      uploadKnowledgeFile,
      handleWorkspaceTabChange,
      mainFiles,
      handleSendWithOptionalAgent,
      setDeepResearchEnabled,
    ]
  );

  const handleDeleteProjectFile = useCallback(
    async (fileId: string) => {
      if (!activeProjectId) return;
      try {
        await deleteFile(activeProjectId, fileId);
        mainFiles.refresh();
        showToast('File removed', 'success');
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Couldn't remove file",
          'error'
        );
      }
    },
    [activeProjectId, deleteFile, mainFiles, showToast]
  );

  const handleOpenAutomation = useCallback(() => {
    selectAgent('web');
    selectWorkspaceTab('automation');
    openContext('automation');
    setBrowserPanelOpen(Boolean(browserRun));
  }, [
    selectAgent,
    selectWorkspaceTab,
    openContext,
    setBrowserPanelOpen,
    browserRun,
  ]);

  const handleStartBrowserAutomation = useCallback(
    async (input: Parameters<typeof startBrowser>[0]) => {
      selectAgent('web');
      const result = await startBrowser(input);
      setBrowserPanelOpen(true);
      openContext('automation');
      return result;
    },
    [selectAgent, startBrowser, setBrowserPanelOpen, openContext]
  );

  const closeAdminDashboard = useCallback(() => setIsAdminDashboardOpen(false), []);

  useEffect(() => {
    if (isDevAuthClientEnabled()) {
      setShowAnalyticsNav(true);
      return;
    }
    let cancelled = false;
    fetchAnalyticsIdentity()
      .then((id) => {
        if (!cancelled && id?.isPlatformAdmin) setShowAnalyticsNav(true);
      })
      .catch(() => {
        /* non-admin — keep Analytics hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openMcpFromBilling = useCallback(() => {
    setIsBillingOpen(false);
    setIsMcpSettingsOpen(true);
  }, []);
  const openBrowserPanel = useCallback(() => setBrowserPanelOpen(true), [setBrowserPanelOpen]);
  const openCodeInterpreterPanel = useCallback(() => {
    openCodePanel();
  }, [openCodePanel]);
  const runCodeCb = useCallback(() => {
    void runCode();
  }, [runCode]);
  const interruptCodeCb = useCallback(() => {
    void interruptCode();
  }, [interruptCode]);
  const restartCodeCb = useCallback(() => {
    void restartCode();
  }, [restartCode]);
  const uploadCodeCb = useCallback(
    (file: File) => {
      void uploadCodeFile(file);
    },
    [uploadCodeFile]
  );
  const publishCodeCanvasCb = useCallback(() => {
    void publishCodeCanvas(chatId);
  }, [publishCodeCanvas, chatId]);
  const closeCodeSessionCb = useCallback(() => {
    void closeCodeSession();
  }, [closeCodeSession]);

  const handleSidebarSelectProject = useCallback(
    (id: string | null) => {
      void selectProject(id);
      clearMessagesAndAgent();
      resetArtifactState();
    },
    [selectProject, clearMessagesAndAgent, resetArtifactState]
  );

  const handleSidebarCreateProject = useCallback(
    async (name: string) => {
      await createProject({ name });
    },
    [createProject]
  );

  const handleSidebarDuplicateProject = useCallback(
    async (id: string) => {
      await duplicateProject(id);
    },
    [duplicateProject]
  );

  const handleSidebarUploadKnowledge = useCallback(
    async (
      projectId: string,
      file: {
        name: string;
        mimeType: string;
        size: number;
        kind: string;
        dataBase64: string;
      }
    ) => {
      await uploadKnowledgeFile(projectId, file);
      if (activeProjectId === projectId) {
        await refreshProjectChats(projectId);
      }
      await refreshProjects();
    },
    [uploadKnowledgeFile, activeProjectId, refreshProjectChats, refreshProjects]
  );

  const handleSidebarSaveMemory = useCallback(
    async (projectId: string, memory: { category: string; key: string; value: string }) => {
      await saveMemory(projectId, memory);
      await refreshProjects();
    },
    [saveMemory, refreshProjects]
  );

  const handleSidebarSelectChat = useCallback(
    (id: string) => {
      void handleSelectChat(id);
    },
    [handleSelectChat]
  );

  const handleSidebarSearchProjects = useCallback(
    (q: string) => {
      void refreshProjects(q);
    },
    [refreshProjects]
  );

  const resolveBrowserApprovalChoice = useCallback(
    (choice: Parameters<typeof resolveBrowserApproval>[0]) => {
      void resolveBrowserApproval(choice);
    },
    [resolveBrowserApproval]
  );

  const stopBrowserCb = useCallback(() => {
    void stopBrowser();
  }, [stopBrowser]);
  const pauseBrowserCb = useCallback(() => {
    void pauseBrowser();
  }, [pauseBrowser]);
  const resumeBrowserCb = useCallback(() => {
    void resumeBrowser();
  }, [resumeBrowser]);

  const cancelAgentCb = useCallback(() => {
    void cancelAgent();
  }, [cancelAgent]);
  const retryAgentCb = useCallback(() => {
    void retryAgent();
  }, [retryAgent]);
  const stopResearchCb = useCallback(() => {
    void stopResearch();
  }, [stopResearch]);
  const resumeResearchCb = useCallback(() => {
    void resumeInterrupted();
  }, [resumeInterrupted]);
  const researchFollowUp = useCallback(
    (q: string) => {
      void handleSendWithOptionalAgent(q);
    },
    [handleSendWithOptionalAgent]
  );

  const lastMessage = messages[messages.length - 1];
  const busy = isLoading || isAgentRunning || isResearchRunning;
  const showTypingIndicator =
    busy &&
    (!lastMessage ||
      lastMessage.role !== 'assistant' ||
      (lastMessage.content === '' &&
        lastMessage.status !== 'error' &&
        !!lastMessage.isStreaming));

  const showAgentChrome =
    isAgentRunning || agentExecutor.steps.length > 0;
  const showResearchChrome =
    isResearchRunning ||
    researchState.progress > 0 ||
    researchState.timeline.length > 0 ||
    !!interruptedSessionId;

  // Calm home: hide workspace chrome until there's something to work with.
  // Live Mode is a separate surface — don't treat an active voice session as empty home.
  const isEmptyHome =
    !isChatLoading &&
    messages.length === 0 &&
    workspaceTab === 'chat' &&
    !activeProject &&
    !isCanvasOpen &&
    !isResearchRunning &&
    !voiceLive;

  // Empty home centers hero + inline composer; threads need floating clearance.
  const scrollBottomInset = isEmptyHome ? 32 : messagesBottomInset;

  // Prepare shared chat layout props ( must be after all state and handler declarations)
  const sharedChatLayoutProps = {
    messages,
    chatId,
    isLoading,
    isChatLoading,
    scrollParentRef: messagesContainerRef,
    activeArtifactId,
    onOpenArtifact: handleOpenArtifact,
    onArtifactsDetected: handleArtifactsDetected,
    onForgetMemory: handleForgetMemory,
    onRegenerate: handleRegenerate,
    onContinue: continueGenerating,
    onRetry: handleRetry,
    onEditPrompt: undefined, // Not implemented in current version
    onEditAndResend: handleEditAndResend,
    onFeedback: handleMessageFeedback,
    onOpenInCanvas: handleOpenInCanvas,
    onShareMessage: handleShareMessage,
    onPinMessage: handlePinMessage,
    onSaveResponse: handleSaveResponse,
    onExportMarkdown: handleExportMessageMarkdown,
    onExportPdf: handleExportMessagePdf,
    onDeleteResponse: handleDeleteResponse,
    regenerateDisabled: isLoading,
    ttsMessageId: ttsMessageId,
    ttsState: ttsState,
    ttsParagraphIndex: ttsParagraphIndex,
    onReadAloud: handleReadAloud,
    onPauseAloud: pauseTts,
    onStopAloud: stopTts,
    // Empty state props - matching DynamicHomeProps
    onSuggestionClick: undefined, // Not implemented in current version
    recentChats: recentChats,
    recentProjects: projects,
    activeProject: activeProject,
    knowledgeFiles: undefined, // Not implemented in current version
    onSelectChat: handleSidebarSelectChat,
    onSelectProject: handleSidebarSelectProject,
    onOpenCanvas: () => void createCanvasAndOpen({ type: 'markdown', title: 'Untitled' }),
    onOpenVoice: openVoiceMode,
    onOpenDashboard: openAiDashboard,
    onOpenMemory: openMemory,
    showWelcome: isEmptyHome,
  };

  const needsContextChrome =
    messages.length > 0 ||
    !!activeProject ||
    isCanvasOpen ||
    isResearchRunning ||
    workspaceTab !== 'chat' ||
    showResearchChrome ||
    !!browserRun ||
    isBrowserStarting;

  const browserPhase = browserExecutionPhaseFromRun(
    browserRun,
    isBrowserStarting
  );

  const commandActions = useMemo<CommandAction[]>(
    () => [
      {
        id: 'settings',
        label: 'Open settings',
        hint: 'Appearance, account & preferences',
        icon: COMMAND_ICONS.Settings,
        group: 'Actions',
        keywords: ['settings', 'preferences', 'theme'],
        onSelect: () => openBillingSettings('general'),
      },
      {
        id: 'billing',
        label: 'Billing & plans',
        hint: 'Manage subscription and usage',
        icon: COMMAND_ICONS.CreditCard,
        group: 'Actions',
        keywords: ['billing', 'plan', 'upgrade', 'pay'],
        onSelect: () => openBillingTab(),
      },
      {
        id: 'memory',
        label: 'Memory',
        hint: 'View and manage remembered facts',
        icon: COMMAND_ICONS.Brain,
        group: 'Actions',
        keywords: ['memory', 'remember'],
        onSelect: () => openMemory(),
      },
      {
        id: 'dashboard',
        label: 'AI Dashboard',
        hint: 'Usage, projects, memory & more',
        icon: COMMAND_ICONS.LayoutDashboard,
        group: 'Actions',
        keywords: ['dashboard', 'usage', 'overview', 'stats'],
        onSelect: () => openAiDashboard(),
      },
      {
        id: 'voice',
        label: 'Live Mode',
        hint: 'Talk with VANI continuously',
        icon: COMMAND_ICONS.Mic,
        shortcut: '⇧⌘V',
        group: 'Actions',
        keywords: ['voice', 'live', 'mic', 'talk', 'speak'],
        onSelect: () => openVoiceMode(),
      },
      {
        id: 'automation',
        label: 'Browser Automation',
        hint: 'Launch a real browser session',
        icon: COMMAND_ICONS.Globe2,
        group: 'Actions',
        keywords: ['automation', 'browser', 'playwright', 'web agent'],
        onSelect: () => handleOpenAutomation(),
      },
      ...(showAnalyticsNav
        ? [
            {
              id: 'analytics',
              label: 'Analytics',
              hint: 'Usage and platform insights',
              icon: COMMAND_ICONS.LayoutDashboard,
              group: 'Actions',
              keywords: ['analytics', 'admin', 'metrics'],
              onSelect: () => openAnalytics(),
            } satisfies CommandAction,
          ]
        : []),
    ],
    [
      openBillingSettings,
      openBillingTab,
      openMemory,
      openVoiceMode,
      openAnalytics,
      openAiDashboard,
      showAnalyticsNav,
      handleOpenAutomation,
    ]
  );

  const viewKey = isLoadingChats && messages.length === 0
    ? 'loading'
    : messages.length === 0
      ? 'empty'
      : `chat-${highlightedChatId || 'new'}`;

  return (
    <CommandPaletteProvider
      actions={commandActions}
      chats={recentChats}
      onSelectChat={handleSidebarSelectChat}
      onNewChat={handleNewChat}
    >
      <KeyboardShortcutsProvider onVoice={openVoiceMode} onNewChat={handleNewChat}>
        <div className="relative flex h-full min-h-0 w-full min-w-0 overflow-hidden">
          {/* Ambient background — breathing mesh + floating light blobs */}
          <div className="app-background" aria-hidden="true">
            <div className="app-background-blobs">
              <span />
              <span />
              <span />
            </div>
          </div>

          <div
            className="relative z-10 flex h-full w-full min-w-0 flex-col pt-2 md:flex-row md:pt-0"
            onDragEnter={(e) => {
              e.preventDefault();
              pageDragDepthRef.current += 1;
              if (e.dataTransfer?.types?.includes('Files')) {
                // Preview handled by composer; page-level capture for empty chrome
              }
            }}
            onDragOver={(e) => {
              if (e.dataTransfer?.types?.includes('Files')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={(e) => {
              if (!e.dataTransfer?.files?.length) return;
              // Only intercept when drop target isn't the composer form
              const target = e.target as HTMLElement | null;
              if (target?.closest?.('form')) return;
              e.preventDefault();
              e.stopPropagation();
              pageDragDepthRef.current = 0;
              handleFilesDropped(e.dataTransfer.files);
            }}
          >
        {/* TEMPORARY: Feature flag for testing new mobile shell */}
        {false ? (
          /* New Mobile Shell - Testing Mode */
          <MobileAppShell
            messages={messages}
            chatId={chatId}
            isLoading={isLoading}
            isChatLoading={isChatLoading}
            isSidebarOpen={isSidebarOpen}
            recentChats={recentChats}
            isLoadingChats={isLoadingChats}
            chatsError={chatsError}
            activeChatId={highlightedChatId}
            projects={projects}
            pinnedProjects={pinnedProjects}
            activeProjectId={activeProjectId}
            projectChats={projectChats}
            isCanvasOpen={isCanvasOpen}
            canvasMobileSurface={canvasMobileSurface}
            onToggleSidebar={handleToggleSidebar}
            onCloseSidebar={closeSidebar}
            onNewChat={handleNewChat}
            onSelectChat={handleSidebarSelectChat}
            onSelectProject={handleSidebarSelectProject}
            onSendMessage={handleSendWithOptionalAgent}
            onStopGenerating={handleStopOrCancel}
            onOpenVoiceMode={openVoiceMode}
            agents={agentTypes}
            selectedAgent={selectedAgent}
            onSelectAgent={selectAgent}
            webSearchEnabled={webSearchEnabled}
            deepResearchEnabled={deepResearchEnabled}
            onToggleWebSearch={setWebSearchEnabled}
            onToggleDeepResearch={setDeepResearchEnabled}
            selectedModel={selectedModel}
            onSelectModel={handleSelectModel}
            projectDefaultModel={projectDefaultModel}
          >
            <SharedChatLayout {...sharedChatLayoutProps} />
          </MobileAppShell>
        ) : (
          /* Existing Layout - Desktop and Current Mobile */
          <>
        {/* Left-edge swipe zone — open drawer on mobile */}
        {!isDesktop && !isSidebarOpen ? (
          <div
            className="fixed inset-y-0 left-0 z-[35] w-5 touch-none md:hidden"
            aria-hidden
            onPointerDown={onEdgePointerDown}
            onPointerMove={onEdgePointerMove}
            onPointerUp={onEdgePointerUp}
            onPointerCancel={onEdgePointerUp}
          />
        ) : null}

        {/* Floating sidebar */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={closeSidebar}
          onOpen={openSidebar}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
          onNewChat={handleNewChat}
          onRenameChat={handleRenameChat}
          onDeleteChat={handleDeleteChat}
          onPinChat={handlePinChat}
          recentChats={recentChats}
          isLoadingChats={isLoadingChats}
          chatsError={chatsError}
          chatsQuery={chatsQuery}
          onSearchChats={searchChats}
          hasMoreChats={hasMoreChats}
          isLoadingMoreChats={isLoadingMoreChats}
          onLoadMoreChats={loadMoreChats}
          projects={projects}
          pinnedProjects={pinnedProjects}
          activeProjectId={activeProjectId}
          projectChats={projectChats}
          activeChatId={highlightedChatId}
          onSelectProject={handleSidebarSelectProject}
          onCreateProject={handleSidebarCreateProject}
          onRenameProject={renameProject}
          onDeleteProject={deleteProject}
          onDuplicateProject={handleSidebarDuplicateProject}
          onArchiveProject={archiveProject}
          onPinProject={pinProject}
          onUploadKnowledge={handleSidebarUploadKnowledge}
          onSaveMemory={handleSidebarSaveMemory}
          onSelectChat={handleSidebarSelectChat}
          onSearchProjects={handleSidebarSearchProjects}
          onOpenMemory={openMemory}
          onOpenSettings={() => openBillingSettings('general')}
          onOpenBilling={openBillingTab}
          onOpenAgents={openAgentsSettings}
          onOpenAnalytics={openAnalytics}
          onOpenDashboard={openAiDashboard}
          onOpenKnowledge={handleOpenKnowledge}
          onOpenCanvasWorkspace={() => {
            void createCanvasAndOpen({ type: 'markdown', title: 'Untitled' });
          }}
          onOpenImages={handleOpenImages}
          onOpenResearch={handleOpenResearchWorkspace}
          onOpenAutomation={handleOpenAutomation}
          showAnalytics={showAnalyticsNav}
          messages={messages}
          conversationTitle={activeConversationTitle}
          shareableChatId={shareableChatId}
          hasArtifact={allArtifacts.length > 0}
          isArtifactOpen={isArtifactPanelOpen && !isCanvasOpen}
          onShowArtifact={handleShowArtifactSurface}
          hasCanvas={canvasTabs.length > 0 || isCanvasOpen}
          isCanvasOpen={isCanvasOpen}
          onShowCanvas={showCanvasSurface}
          hasBrowser={Boolean(browserRun) || isBrowserActive || Boolean(browserApproval)}
          isBrowserOpen={browserPanelOpen && Boolean(browserRun)}
          onShowBrowser={openBrowserPanel}
          hasCodeInterpreter={codePanelOpen}
          isCodeInterpreterOpen={codePanelOpen}
          onShowCodeInterpreter={openCodeInterpreterPanel}
        />

        {/* Main chat area — hidden on mobile while Canvas/Artifact surface is active */}
        <div
          id="main-content"
          role="main"
          className={
            (isCanvasOpen && canvasMobileSurface === 'canvas') ||
            (isArtifactPanelOpen && !isCanvasOpen && mobileSurface === 'artifact')
              ? 'relative hidden min-h-0 min-w-0 w-full flex-1 flex-col overflow-x-hidden md:flex'
              : 'relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-x-hidden'
          }
        >
          <Header onToggleSidebar={handleToggleSidebar} />

          {activeProject && !isEmptyHome ? (
            <ProjectWorkspaceBar
              project={activeProject}
              active={workspaceTab === 'files' ? 'files' : 'chat'}
              onNavigate={handleProjectWorkspaceNav}
            />
          ) : null}

          {/* Messages scroll region */}
          <main
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className={
              isEmptyHome
                ? 'custom-scrollbar relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto overflow-x-hidden scroll-smooth max-md:items-start max-md:justify-start max-md:overscroll-y-contain max-md:[-webkit-overflow-scrolling:touch]'
                : 'custom-scrollbar relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-smooth max-md:overscroll-y-contain max-md:[-webkit-overflow-scrolling:touch]'
            }
          >
            <div
              className={
                isEmptyHome
                  ? 'vani-chat-column flex w-full min-w-0 flex-col px-4 py-10 scroll-mt-0 md:px-8 max-md:pb-32 max-md:pt-20'
                  : 'vani-chat-column flex min-w-0 flex-col px-4 pt-6 scroll-mt-0 md:px-8 md:pt-8 max-md:pt-20'
              }
              style={{ paddingBottom: scrollBottomInset }}
            >
              {workspaceTab === 'files' ? (
                <PageTransition viewKey="files">
                  <FilesWorkspace
                    projectId={activeProjectId}
                    projectName={activeProject?.name}
                    files={mainFiles.files}
                    loading={mainFiles.loading}
                    onRefresh={mainFiles.refresh}
                    onUpload={
                      activeProjectId
                        ? async (file) => {
                            await uploadKnowledgeFile(activeProjectId, file);
                            mainFiles.refresh();
                          }
                        : undefined
                    }
                    onDelete={handleDeleteProjectFile}
                    onSummarize={(name) => {
                      void handleSendWithOptionalAgent(
                        `Summarize the project knowledge file “${name}”.`
                      );
                      selectWorkspaceTab('chat');
                    }}
                    onResearch={(name) => {
                      setDeepResearchEnabled(true);
                      void handleSendWithOptionalAgent(
                        `Research topics related to “${name}” from my project knowledge.`
                      );
                      selectWorkspaceTab('chat');
                    }}
                  />
                </PageTransition>
              ) : null}

              {workspaceTab === 'automation' ? (
                <PageTransition viewKey="automation">
                  <AutomationWorkspace
                    run={browserRun}
                    isStarting={isBrowserStarting}
                    error={browserError}
                    onStart={handleStartBrowserAutomation}
                    onOpenPanel={openBrowserPanel}
                  />
                </PageTransition>
              ) : null}

              {(workspaceTab === 'chat' ||
                workspaceTab === 'canvas' ||
                workspaceTab === 'research') && (
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
                ) : isChatLoading ? (
                  <PageTransition viewKey="loading">
                    <ConversationSkeleton />
                  </PageTransition>
                ) : messages.length === 0 ? (
                  <PageTransition viewKey="empty">
                    <EmptyState />
                  </PageTransition>
                ) : (
                  <PageTransition viewKey={viewKey}>
                  <div className="flex flex-col">
                    <VirtualizedMessageList
                      messages={messages}
                      threadKey={String(highlightedChatId || chatId || 'new')}
                      scrollParentRef={messagesContainerRef}
                      activeArtifactId={activeArtifactId}
                      onOpenArtifact={handleOpenArtifact}
                      onArtifactsDetected={handleArtifactsDetected}
                      onForgetMemory={handleForgetMemory}
                      onRegenerate={handleRegenerate}
                      onContinue={handleContinue}
                      onRetry={handleRetry}
                      onEditAndResend={handleEditAndResend}
                      onFeedback={handleMessageFeedback}
                      onOpenInCanvas={handleOpenInCanvas}
                      onShareMessage={handleShareMessage}
                      onPinMessage={handlePinMessage}
                      onSaveResponse={handleSaveResponse}
                      onExportMarkdown={handleExportMessageMarkdown}
                      onExportPdf={handleExportMessagePdf}
                      onDeleteResponse={handleDeleteResponse}
                      regenerateDisabled={isLoading}
                      ttsMessageId={ttsMessageId}
                      ttsState={ttsState}
                      ttsParagraphIndex={ttsParagraphIndex}
                      onReadAloud={handleReadAloud}
                      onPauseAloud={pauseTts}
                      onStopAloud={stopTts}
                    />

                    <AnimatePresence>
                      {showTypingIndicator ? (
                        <TypingIndicator key="typing" phase={streamPhase} />
                      ) : null}
                    </AnimatePresence>

                    {showAgentChrome && (
                      <div className="mt-3 mb-1 space-y-2">
                        <Suspense fallback={<InlinePanelSkeleton />}>
                          <AgentStatus
                            agent={selectedAgentInfo}
                            executor={agentExecutor}
                            isRunning={isAgentRunning}
                          />
                          <ExecutionTimeline
                            executor={agentExecutor}
                            isRunning={isAgentRunning}
                            open={agentTimelineOpen}
                            onOpenChange={setAgentTimelineOpen}
                            onCancel={cancelAgentCb}
                            onRetry={retryAgentCb}
                          />
                        </Suspense>
                      </div>
                    )}

                    {showResearchChrome && (
                      <div className="mt-3 mb-1">
                        <Suspense fallback={<InlinePanelSkeleton />}>
                          <ResearchPanel
                            state={researchState}
                            isRunning={isResearchRunning}
                            open={researchPanelOpen}
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

              {/* isEmptyHome already implies workspaceTab === 'chat' and !activeProject */}
              {isEmptyHome && !voiceLive ? (
                <ChatInput
                  ref={chatInputRef}
                  placement="inline"
                  onSendMessage={handleSendWithOptionalAgent}
                  isLoading={busy || isChatLoading}
                  onStopGenerating={handleStopOrCancel}
                  onOpenVoiceMode={openVoiceMode}
                  onOpenCanvas={() => {
                    void createCanvasAndOpen({ type: 'markdown', title: 'Untitled' });
                  }}
                  onHeightChange={handleComposerHeightChange}
                  agents={agentTypes}
                  selectedAgent={selectedAgent}
                  onSelectAgent={handleSelectAgent}
                  webSearchEnabled={webSearchEnabled}
                  deepResearchEnabled={deepResearchEnabled}
                  onToggleWebSearch={setWebSearchEnabled}
                  onToggleDeepResearch={setDeepResearchEnabled}
                  selectedModel={selectedModel}
                  onSelectModel={handleSelectModel}
                  projectDefaultModel={null}
                  onFilesDropped={handleFilesDropped}
                />
              ) : null}
            </div>
          </main>

          {/* Floating composer — conversation mode only (home uses inline input) */}
          {quotaDenial ? (
            <QuotaExceededBanner
              denial={quotaDenial}
              onUpgrade={() => {
                setQuotaDenial(null);
                openBillingSettings('billing');
              }}
              onDismiss={() => setQuotaDenial(null)}
            />
          ) : null}
          <UpgradePlanModal
            open={Boolean(upgradeDenial)}
            denial={upgradeDenial}
            onClose={() => setUpgradeDenial(null)}
            onUpgrade={() => {
              setUpgradeDenial(null);
              openBillingSettings('billing');
            }}
          />
          {!isEmptyHome && workspaceTab !== 'automation' && !voiceLive ? (
          <ChatInput
            ref={chatInputRef}
            onSendMessage={handleSendWithOptionalAgent}
            // Also disabled while a past conversation's history is loading —
            // prevents a message from being sent against the chat being left
            // (chatId/attachments haven't swapped over to the new thread yet).
            isLoading={busy || isChatLoading}
            onStopGenerating={handleStopOrCancel}
            onOpenVoiceMode={openVoiceMode}
            onOpenCanvas={() => {
              void createCanvasAndOpen({ type: 'markdown', title: 'Untitled' });
            }}
            onHeightChange={handleComposerHeightChange}
            agents={agentTypes}
            selectedAgent={selectedAgent}
            onSelectAgent={handleSelectAgent}
            webSearchEnabled={webSearchEnabled}
            deepResearchEnabled={deepResearchEnabled}
            onToggleWebSearch={setWebSearchEnabled}
            onToggleDeepResearch={setDeepResearchEnabled}
            selectedModel={selectedModel}
            onSelectModel={handleSelectModel}
            projectDefaultModel={activeProject?.settings?.model || null}
            onFilesDropped={handleFilesDropped}
          />
          ) : null}
        </div>

        <ContextPanel
          open={contextOpen}
          surface={contextSurface}
          onClose={closeContext}
          onToggle={toggleContext}
          showReopenButton={needsContextChrome}
          activeProject={activeProject}
          recentChats={recentChats}
          messages={messages}
          memories={memoryPreview.memories}
          researchRunning={isResearchRunning}
          researchStatus={researchState.status}
          canvasOpen={isCanvasOpen}
          canvasTitle={
            activeCanvasId ? canvasTitles[activeCanvasId] || null : null
          }
          selectedAgentLabel={selectedAgentInfo?.name || selectedAgent || null}
          browserStatus={browserPhase}
          browserGoal={browserRun?.goal || null}
          onOpenBrowserPanel={openBrowserPanel}
          onSelectChat={handleSidebarSelectChat}
          onOpenMemory={openMemory}
          onOpenAgents={openAgentsSettings}
          onUploadKnowledge={
            activeProjectId
              ? async (file) => {
                  await uploadKnowledgeFile(activeProjectId, file);
                }
              : undefined
          }
          onDeleteFile={handleDeleteProjectFile}
          onSuggestion={(text) => {
            void handleSendWithOptionalAgent(text);
            selectWorkspaceTab('chat');
          }}
          onSummarizeFile={(name) => {
            void handleSendWithOptionalAgent(
              `Summarize the project knowledge file “${name}”.`
            );
            selectWorkspaceTab('chat');
          }}
          onResearchFile={(name) => {
            setDeepResearchEnabled(true);
            void handleSendWithOptionalAgent(
              `Research topics related to “${name}” from my project knowledge.`
            );
            selectWorkspaceTab('chat');
          }}
        />

        <DropActionsOverlay
          open={dropOverlayOpen}
          hasProject={!!activeProjectId}
          fileCount={pendingDropFilesRef.current?.length || 0}
          onAction={(action) => void handleDropAction(action)}
          onCancel={() => {
            setDropOverlayOpen(false);
            pendingDropFilesRef.current = null;
          }}
        />

        <Suspense
          fallback={
            <div
              className="pointer-events-none fixed z-[84] bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] right-4 sm:bottom-8 sm:right-8"
              aria-hidden
            >
              <CompactControlSkeleton className="h-14 w-14" />
            </div>
          }
        >
          <VoiceModeHost
            chatId={chatId}
            projectId={activeProjectId}
            messages={messages}
            isChatLoading={isLoading}
            sendMessage={handleSendMessage}
            stopGenerating={stopGenerating}
            onRegisterOpen={registerOpenVoice}
            onLiveChange={handleVoiceLiveChange}
            minimizeSignal={voiceMinimizeSignal}
          />
        </Suspense>

        {isMemoryOpen ? (
          <Suspense fallback={<ModalPanelSkeleton />}>
            <MemoryManager open onClose={closeMemory} chatId={chatId} />
          </Suspense>
        ) : null}
        {isBillingOpen ? (
          <Suspense fallback={<ModalPanelSkeleton />}>
            <BillingSettings
              open
              onClose={closeBillingSettings}
              onOpenMcp={openMcpFromBilling}
              onOpenMemory={openMemory}
              initialSection={settingsSection}
              selectedModel={selectedModel}
              onSelectModel={handleSelectModel}
              projectDefaultModel={activeProject?.settings?.model || null}
            />
          </Suspense>
        ) : null}
        {isMcpSettingsOpen ? (
          <Suspense fallback={<ModalPanelSkeleton />}>
            <McpSettings open onClose={closeMcpSettings} />
          </Suspense>
        ) : null}
        {isAnalyticsOpen ? (
          <Suspense fallback={<ModalPanelSkeleton maxWidthClass="max-w-[820px]" />}>
            <AnalyticsPanel
              open
              onClose={closeAnalytics}
              onOpenAdmin={openAdminDashboard}
            />
          </Suspense>
        ) : null}
        {isAiDashboardOpen ? (
          <Suspense fallback={<ModalPanelSkeleton maxWidthClass="max-w-[820px]" />}>
            <AiDashboard
              open
              onClose={closeAiDashboard}
              projects={projects}
              recentChats={recentChats}
              onOpenAnalytics={openAnalytics}
              onOpenMemory={openMemory}
              onOpenAgents={openAgentsSettings}
              onOpenVoice={openVoiceMode}
              onSelectProject={handleSidebarSelectProject}
              onSelectChat={handleSidebarSelectChat}
              onStartResearch={handleOpenResearchWorkspace}
            />
          </Suspense>
        ) : null}
        {isAdminDashboardOpen ? (
          <Suspense fallback={<ModalPanelSkeleton maxWidthClass="max-w-[820px]" />}>
            <AdminDashboard open onClose={closeAdminDashboard} />
          </Suspense>
        ) : null}

        {browserApproval ? (
          <Suspense fallback={<DialogSkeleton />}>
            <BrowserPermissionDialog
              approval={browserApproval}
              onResolve={resolveBrowserApprovalChoice}
            />
          </Suspense>
        ) : null}

        {/* Browser automation — live preview + step log */}
        <AnimatePresence>
          {browserPanelOpen && browserRun && (
            <Suspense
              fallback={
                <SidePanelSkeleton
                  widthClass="md:w-[420px] lg:w-[460px]"
                  className={
                    workspaceTab === 'automation' ? 'flex' : 'hidden md:flex'
                  }
                />
              }
            >
              <BrowserPanel
                run={browserRun}
                previewUrl={browserPreviewUrl}
                open={browserPanelOpen}
                onOpenChange={setBrowserPanelOpen}
                onStop={stopBrowserCb}
                onPause={pauseBrowserCb}
                onResume={resumeBrowserCb}
                className={
                  workspaceTab === 'automation'
                    ? 'flex'
                    : 'hidden md:flex'
                }
              />
            </Suspense>
          )}
        </AnimatePresence>

        {/* Code Interpreter — sandbox editor + output */}
        <AnimatePresence>
          {codePanelOpen && (
            <Suspense
              fallback={
                <SidePanelSkeleton
                  widthClass="md:w-[460px] lg:w-[520px]"
                  className="hidden md:flex"
                />
              }
            >
              <CodeInterpreterPanel
                open={codePanelOpen}
                onOpenChange={setCodePanelOpen}
                session={codeSession}
                code={codeSource}
                onCodeChange={setCodeSource}
                stdout={codeStdout}
                stderr={codeStderr}
                error={codeError}
                isRunning={isCodeRunning}
                isStarting={isCodeStarting}
                uploadProgress={codeUploadProgress}
                files={codeFiles}
                plots={codePlots}
                fileUrl={codeFileUrl}
                onRun={runCodeCb}
                onInterrupt={interruptCodeCb}
                onRestart={restartCodeCb}
                onUpload={uploadCodeCb}
                onPublishCanvas={publishCodeCanvasCb}
                onCloseSession={closeCodeSessionCb}
                className="hidden md:flex"
              />
            </Suspense>
          )}
        </AnimatePresence>

        {/* Canvas workspace — primary collaborative panel (ChatGPT Canvas + Artifacts hybrid) */}
        <AnimatePresence>
          {isCanvasOpen && canvasTabs.length > 0 && (
            <Suspense
              fallback={
                <SidePanelSkeleton
                  className={
                    canvasMobileSurface === 'chat'
                      ? 'hidden md:flex'
                      : 'flex w-full md:w-auto'
                  }
                />
              }
            >
              <CanvasPanel
                tabs={canvasTabs}
                activeId={activeCanvasId}
                drafts={canvasDrafts}
                titles={canvasTitles}
                saveStatus={canvasSaveStatus}
                viewMode={canvasViewMode}
                conflicts={canvasConflicts}
                versions={canvasVersions}
                diffBaseline={canvasDiffBaseline}
                isFullscreen={isCanvasFullscreen}
                isAiBusy={isCanvasAiBusy}
                panelWidth={canvasPanelWidth}
                onSelectTab={setActiveCanvasId}
                onCloseTab={(id) => void closeCanvasTab(id)}
                onRename={(id, title) => void renameCanvasTab(id, title)}
                onDuplicate={(id) => void duplicateCanvasTab(id)}
                onTogglePin={(id) => void toggleCanvasPin(id)}
                onDraftChange={setDraftContent}
                onTitleChange={setDraftTitle}
                onSetMode={setCanvasMode}
                onToggleFullscreen={() => setCanvasFullscreen((v) => !v)}
                onClosePanel={handleCloseCanvasPanel}
                onShowChat={handleShowChatSurface}
                isDirty={isCanvasDirty()}
                onSave={async () => {
                  if (activeCanvasId) await flushCanvasAutosave(activeCanvasId);
                }}
                onSaveAndReturn={async () => {
                  if (activeCanvasId) await flushCanvasAutosave(activeCanvasId);
                }}
                onDiscardAndReturn={() => {
                  if (activeCanvasId) discardDraftChanges(activeCanvasId);
                }}
                onResolveConflict={(id, strategy) => void resolveCanvasConflict(id, strategy)}
                onAiEdit={(id, action, opts) => void runAiEdit(id, action, opts)}
                onLoadVersions={(id) => void loadCanvasVersions(id)}
                onRestoreVersion={(id, versionId) => void restoreCanvasVersion(id, versionId)}
                onLoadDiff={(id, versionId) => void loadDiffAgainstVersion(id, versionId)}
                onResize={setCanvasPanelWidth}
                className={
                  canvasMobileSurface === 'chat'
                    ? 'hidden md:flex'
                    : 'flex w-full md:w-auto'
                }
              />
            </Suspense>
          )}
        </AnimatePresence>

        <OpenCanvasConfirmSheet
          open={Boolean(canvasConfirm)}
          onCancel={handleCancelOpenCanvas}
          onConfirm={handleConfirmOpenCanvas}
          title={
            canvasConfirm?.source === 'artifact'
              ? canvasConfirm.artifact.title
              : canvasConfirm?.title
          }
        />

        {/* Artifact panel — fallback when Canvas is not open */}
        <AnimatePresence>
          {!isCanvasOpen && isArtifactPanelOpen && activeArtifact && (
            <Suspense
              fallback={
                <SidePanelSkeleton
                  widthClass="md:w-[480px] lg:w-[520px]"
                  className={
                    mobileSurface === 'chat'
                      ? 'hidden md:flex'
                      : 'flex w-full md:w-[480px] lg:w-[520px]'
                  }
                />
              }
            >
              <ArtifactPanel
                artifact={activeArtifact}
                isFullscreen={isArtifactFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
                onClose={handleCloseArtifactPanel}
                onShowChat={handleShowChatSurface}
                className={
                  mobileSurface === 'chat'
                    ? 'hidden md:flex'
                    : 'flex w-full md:w-[480px] lg:w-[520px]'
                }
              />
            </Suspense>
          )}
        </AnimatePresence>
          </>
        )}
      </div>
    </div>
      </KeyboardShortcutsProvider>
    </CommandPaletteProvider>
  );
}
