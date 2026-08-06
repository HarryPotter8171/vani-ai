'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  MessageSquare,
  Sparkles,
  Brain,
  Search,
  PanelsTopLeft,
  Bot,
  FolderKanban,
  PanelRightClose,
  PanelRightOpen,
  Globe2,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { EASE } from '@/lib/motion';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import FilesWorkspace, { useProjectFiles } from '@/components/workspace/FilesWorkspace';
import TasksWorkspace from '@/components/workspace/TasksWorkspace';
import type { ContextSurface } from '@/lib/workspace/types';
import type { ChatSummary, Message, Project } from '@/lib/types';
import type { MemoryItem } from '@/lib/memory';

export interface ContextPanelProps {
  open: boolean;
  surface: ContextSurface;
  onClose: () => void;
  onToggle?: () => void;
  /** When false, hide the floating reopen control (e.g. empty homepage). */
  showReopenButton?: boolean;
  activeProject?: Project | null;
  recentChats?: ChatSummary[];
  messages?: Message[];
  memories?: MemoryItem[];
  researchRunning?: boolean;
  researchStatus?: string | null;
  canvasOpen?: boolean;
  canvasTitle?: string | null;
  selectedAgentLabel?: string | null;
  browserStatus?: string | null;
  browserGoal?: string | null;
  onOpenBrowserPanel?: () => void;
  onSelectChat?: (chatId: string) => void;
  onOpenMemory?: () => void;
  onOpenAgents?: () => void;
  onUploadKnowledge?: (file: {
    name: string;
    mimeType: string;
    size: number;
    kind: string;
    dataBase64: string;
  }) => Promise<void> | void;
  onDeleteFile?: (fileId: string) => Promise<void> | void;
  onSuggestion?: (text: string) => void;
  onSummarizeFile?: (fileName: string) => void;
  onResearchFile?: (fileName: string) => void;
  className?: string;
}

function ConversationContext({
  messages = [],
  recentChats = [],
  onSelectChat,
  onSuggestion,
}: {
  messages?: Message[];
  recentChats?: ChatSummary[];
  onSelectChat?: (chatId: string) => void;
  onSuggestion?: (text: string) => void;
}) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const tips = [
    'Ask VANI to open a Canvas for long-form drafting.',
    'Pin key decisions into Memory for later chats.',
    'Drop a PDF to summarize or add to knowledge.',
  ];

  return (
    <div className="space-y-4">
      <div className="productivity-widget">
        <div className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          <MessageSquare size={11} />
          Conversation
        </div>
        {lastUser ? (
          <p className="line-clamp-4 text-sm leading-relaxed text-foreground/90">
            {typeof lastUser.content === 'string'
              ? lastUser.content.slice(0, 220)
              : 'Attachment message'}
          </p>
        ) : (
          <p className="text-sm text-text-secondary">
            Start chatting — context will appear here.
          </p>
        )}
        <p className="mt-2 text-micro tabular-nums text-text-tertiary">
          {messages.length} messages
        </p>
      </div>

      <div className="productivity-widget">
        <div className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          <Sparkles size={11} />
          Suggested next
        </div>
        <ul className="space-y-1.5">
          {tips.map((tip) => (
            <li key={tip}>
              <button
                type="button"
                onClick={() => onSuggestion?.(tip)}
                className="w-full text-left text-caption leading-snug text-text-secondary hover:text-accent"
              >
                {tip}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {recentChats.length > 0 ? (
        <div className="productivity-widget">
          <div className="mb-2 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            Related chats
          </div>
          <ul className="space-y-1">
            {recentChats.slice(0, 4).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelectChat?.(c.id)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-caption font-medium text-foreground">
                    {c.title || 'Untitled'}
                  </span>
                  <span className="text-micro text-text-tertiary">
                    {formatRelativeTime(c.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MemoryContext({
  memories = [],
  onOpenMemory,
}: {
  memories?: MemoryItem[];
  onOpenMemory?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="os-section-label px-0">Memory</div>
        {onOpenMemory ? (
          <button
            type="button"
            onClick={onOpenMemory}
            className="text-micro font-medium text-accent hover:underline"
          >
            Manage
          </button>
        ) : null}
      </div>
      {memories.length === 0 ? (
        <PremiumEmpty
          size="sm"
          icon={Brain}
          title="No memories yet"
          description="Ask VANI to remember preferences."
          className="px-0 py-3"
        />
      ) : (
        <ul className="space-y-2">
          {memories.slice(0, 6).map((m) => (
            <li
              key={m.id}
              className="rounded-[14px] border border-border-subtle bg-surface-hover px-3 py-2.5"
            >
              <p className="line-clamp-3 text-caption leading-relaxed text-foreground/90">
                {m.content}
              </p>
              <p className="mt-1 text-micro capitalize text-text-tertiary">
                {m.category}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ContextPanel({
  open,
  surface,
  onClose,
  onToggle,
  showReopenButton = true,
  activeProject = null,
  recentChats = [],
  messages = [],
  memories = [],
  researchRunning,
  researchStatus,
  canvasOpen,
  canvasTitle,
  selectedAgentLabel,
  browserStatus,
  browserGoal,
  onOpenBrowserPanel,
  onSelectChat,
  onOpenMemory,
  onOpenAgents,
  onUploadKnowledge,
  onDeleteFile,
  onSuggestion,
  onSummarizeFile,
  onResearchFile,
  className,
}: ContextPanelProps) {
  const projectId = activeProject?._id ?? null;
  const { files, loading, refresh } = useProjectFiles(
    open && (surface === 'files' || surface === 'project') ? projectId : null
  );

  const [title, setTitle] = useState('Context');

  useEffect(() => {
    const map: Record<ContextSurface, string> = {
      conversation: 'Conversation',
      canvas: 'Canvas',
      files: 'Files',
      research: 'Research',
      memory: 'Memory',
      tasks: 'Tasks',
      agents: 'Agents',
      project: 'Project',
      automation: 'Automation',
    };
    setTitle(map[surface] || 'Context');
  }, [surface]);

  return (
    <>
      {/* Desktop floating toggle when closed — only when context is relevant */}
      {!open && showReopenButton && onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Open context panel"
          className={cn(
            'fixed right-3 top-1/2 z-30 hidden -translate-y-1/2 xl:flex',
            'h-10 w-10 items-center justify-center rounded-full',
            'border border-border bg-surface-glass backdrop-blur-[var(--blur-glass)]',
            'text-text-secondary shadow-2 hover:text-accent'
          )}
        >
          <PanelRightOpen size={16} />
        </button>
      ) : null}

      <AnimatePresence>
        {open ? (
          <motion.aside
            initial={{ opacity: 0, x: 24, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 300 }}
            exit={{ opacity: 0, x: 16, width: 0 }}
            transition={{ duration: 0.28, ease: EASE.smooth }}
            className={cn(
              'relative z-20 hidden h-full shrink-0 overflow-hidden xl:flex',
              className
            )}
            aria-label="Context panel"
          >
            <div
              className={cn(
                'm-4 ml-2 flex w-[284px] flex-col overflow-hidden',
                'rounded-[var(--radius-lg)] border border-border',
                'bg-surface-glass backdrop-blur-[var(--blur-glass)] backdrop-saturate-[1.7]',
                'shadow-2'
              )}
            >
              <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-[-0.02em] text-foreground">
                    {title}
                  </p>
                  <p className="truncate text-micro text-text-tertiary">
                    {activeProject?.name || 'Personal workspace'}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  {onToggle ? (
                    <button
                      type="button"
                      aria-label="Collapse context"
                      onClick={onToggle}
                      className="rounded-full p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-foreground"
                    >
                      <PanelRightClose size={14} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Close context panel"
                    onClick={onClose}
                    className="rounded-full p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3.5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={surface}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: EASE.smooth }}
                  >
                    {surface === 'conversation' ? (
                      <ConversationContext
                        messages={messages}
                        recentChats={recentChats}
                        onSelectChat={onSelectChat}
                        onSuggestion={onSuggestion}
                      />
                    ) : null}

                    {surface === 'files' || surface === 'project' ? (
                      <FilesWorkspace
                        projectId={projectId}
                        projectName={activeProject?.name}
                        files={files}
                        loading={loading}
                        onRefresh={refresh}
                        onUpload={onUploadKnowledge}
                        onDelete={onDeleteFile}
                        onSummarize={onSummarizeFile}
                        onResearch={onResearchFile}
                        compact
                      />
                    ) : null}

                    {surface === 'memory' ? (
                      <MemoryContext memories={memories} onOpenMemory={onOpenMemory} />
                    ) : null}

                    {surface === 'tasks' ? (
                      <TasksWorkspace
                        projectId={projectId}
                        compact
                        onAskAi={onSuggestion}
                      />
                    ) : null}

                    {surface === 'research' ? (
                      <div className="space-y-3">
                        <div className="productivity-widget">
                          <div className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            <Search size={11} />
                            Research
                          </div>
                          <p className="text-sm font-semibold text-foreground">
                            {researchRunning
                              ? 'Running…'
                              : researchStatus || 'Ready'}
                          </p>
                          <p className="mt-1 text-caption text-text-secondary">
                            Ask a research question in chat. Sources and timeline
                            appear inline as VANI works.
                          </p>
                        </div>
                        {onSuggestion ? (
                          <button
                            type="button"
                            onClick={() =>
                              onSuggestion(
                                'Run deep research on the latest developments relevant to my current project.'
                              )
                            }
                            className="w-full rounded-[14px] border border-border bg-accent-muted px-3 py-2.5 text-left text-sm font-medium text-accent hover:bg-accent/20"
                          >
                            Start a research brief
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {surface === 'automation' ? (
                      <div className="space-y-3">
                        <div className="productivity-widget">
                          <div className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            <Globe2 size={11} />
                            Browser
                          </div>
                          <p className="text-sm font-semibold text-foreground">
                            {browserStatus || 'Ready'}
                          </p>
                          <p className="mt-1 text-caption text-text-secondary">
                            {browserGoal ||
                              'Start a task in Automation. Live preview opens in the Browser panel.'}
                          </p>
                        </div>
                        {onOpenBrowserPanel ? (
                          <button
                            type="button"
                            onClick={onOpenBrowserPanel}
                            className="w-full rounded-[14px] border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface-hover"
                          >
                            Open Browser panel
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {surface === 'canvas' ? (
                      <div className="space-y-3">
                        <div className="productivity-widget">
                          <div className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            <PanelsTopLeft size={11} />
                            Canvas
                          </div>
                          <p className="text-sm font-semibold text-foreground">
                            {canvasOpen
                              ? canvasTitle || 'Untitled canvas'
                              : 'No canvas open'}
                          </p>
                          <p className="mt-1 text-caption text-text-secondary">
                            Edit beside chat. Use Ask AI to rewrite, expand, or
                            refactor.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {surface === 'agents' ? (
                      <div className="space-y-3">
                        <div className="productivity-widget">
                          <div className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                            <Bot size={11} />
                            Agents
                          </div>
                          <p className="text-sm font-semibold text-foreground">
                            {selectedAgentLabel || 'No agent selected'}
                          </p>
                          <p className="mt-1 text-caption text-text-secondary">
                            Pick an agent from the composer to plan and execute
                            multi-step work.
                          </p>
                        </div>
                        {onOpenAgents ? (
                          <button
                            type="button"
                            onClick={onOpenAgents}
                            className="w-full rounded-[14px] border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface-hover"
                          >
                            Agent settings
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {surface === 'project' && activeProject ? (
                      <div className="mt-4 productivity-widget">
                        <div className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                          <FolderKanban size={11} />
                          Project
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                          {activeProject.name}
                        </p>
                        {activeProject.description ? (
                          <p className="mt-1 line-clamp-3 text-caption text-text-secondary">
                            {activeProject.description}
                          </p>
                        ) : null}
                        <p className="mt-2 text-micro text-text-tertiary">
                          {activeProject.stats?.fileCount ?? files.length} files ·{' '}
                          {activeProject.stats?.chatCount ?? 0} chats ·{' '}
                          {activeProject.stats?.memoryCount ?? 0} memories
                        </p>
                      </div>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Always-visible memory strip */}
              {surface !== 'memory' && memories[0] ? (
                <div className="border-t border-border px-3.5 py-2.5">
                  <div className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                    <Brain size={10} />
                    Recent memory
                  </div>
                  <p className="mt-1 line-clamp-2 text-micro text-text-secondary">
                    {memories[0].content}
                  </p>
                </div>
              ) : null}
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
