'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Search,
  Brain,
  BarChart3,
  Settings,
  Plus,
  MoreHorizontal,
  FolderKanban,
  Pin,
  Archive,
  Copy,
  Trash2,
  Pencil,
  Upload,
  X,
  Sun,
  Moon,
  Crown,
  FileCode2,
  Globe2,
  PanelsTopLeft,
  TerminalSquare,
  Bot,
  BookOpen,
  ImageIcon,
  LayoutDashboard,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatSummary, Message, Project } from '@/lib/types';
import {
  getAttachmentKind,
  readFileAsBase64,
  resolveMimeType,
} from '@/lib/files';
import ChatHistorySection from '@/components/sidebar/ChatHistorySection';
import ChatHistoryItem from '@/components/sidebar/ChatHistoryItem';
import SidebarSearch from '@/components/sidebar/SidebarSearch';
import SidebarNavSection from '@/components/sidebar/SidebarNavSection';
import UserMenu from '@/components/auth/UserMenu';
import ExportMenu from '@/components/chat/ExportMenu';
import ShareMenu from '@/components/chat/ShareMenu';
import { useThemeContext } from '@/components/layout/ThemeProvider';
import VaniLogo from '@/components/brand/VaniLogo';

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called to reveal the mobile drawer (e.g. from the ⌘K/Ctrl+K shortcut) — a no-op on desktop, where the sidebar is always visible. */
  onOpen?: () => void;
  /** Personal (non-project) chat history — rendered by ChatHistorySection. */
  recentChats?: ChatSummary[];
  isLoadingChats?: boolean;
  chatsError?: string | null;
  chatsQuery?: string;
  onSearchChats?: (q: string) => void;
  /** Rename/delete/pin — wired from ChatPage to chat history + project chat APIs. */
  onRenameChat?: (chatId: string, newTitle: string) => void;
  onDeleteChat?: (chatId: string) => void;
  onPinChat?: (chatId: string, pinned: boolean) => void;
  hasMoreChats?: boolean;
  isLoadingMoreChats?: boolean;
  onLoadMoreChats?: () => void;
  onNewChat?: () => void;
  projects?: Project[];
  pinnedProjects?: Project[];
  activeProjectId?: string | null;
  projectChats?: ChatSummary[];
  activeChatId?: string | null;
  onSelectProject?: (projectId: string | null) => void;
  onCreateProject?: (name: string) => Promise<void> | void;
  onRenameProject?: (projectId: string, name: string) => Promise<void> | void;
  onDeleteProject?: (projectId: string) => Promise<void> | void;
  onDuplicateProject?: (projectId: string) => Promise<void> | void;
  onArchiveProject?: (projectId: string) => Promise<void> | void;
  onPinProject?: (projectId: string, pinned: boolean) => Promise<void> | void;
  onUploadKnowledge?: (projectId: string, file: {
    name: string;
    mimeType: string;
    size: number;
    kind: string;
    dataBase64: string;
  }) => Promise<void> | void;
  onSaveMemory?: (
    projectId: string,
    memory: { category: string; key: string; value: string }
  ) => Promise<void> | void;
  onSelectChat?: (chatId: string) => void;
  onSearchProjects?: (q: string) => void;
  /** Opens Settings → Memory (long-term memory manager). */
  onOpenMemory?: () => void;
  /** Opens Settings (Billing section). */
  onOpenSettings?: () => void;
  /** Opens Billing settings (e.g. from the Pro card). */
  onOpenBilling?: () => void;
  /** Opens Settings → Agents. */
  onOpenAgents?: () => void;
  /** Opens Usage Analytics panel — only for admin / dev mode. */
  onOpenAnalytics?: () => void;
  /** Opens unified AI Dashboard. */
  onOpenDashboard?: () => void;
  /** Workspace destinations */
  onOpenKnowledge?: () => void;
  onOpenCanvasWorkspace?: () => void;
  onOpenImages?: () => void;
  onOpenResearch?: () => void;
  onOpenAutomation?: () => void;
  /** When true, show Analytics in the nav (admin / developer). */
  showAnalytics?: boolean;
  /** Conversation tools — live in the sidebar (no floating chat header). */
  messages?: Message[];
  conversationTitle?: string;
  shareableChatId?: string | null;
  hasArtifact?: boolean;
  isArtifactOpen?: boolean;
  onShowArtifact?: () => void;
  hasCanvas?: boolean;
  isCanvasOpen?: boolean;
  onShowCanvas?: () => void;
  hasBrowser?: boolean;
  isBrowserOpen?: boolean;
  onShowBrowser?: () => void;
  hasCodeInterpreter?: boolean;
  isCodeInterpreterOpen?: boolean;
  onShowCodeInterpreter?: () => void;
}

type NavAction =
  | 'chat'
  | 'search'
  | 'projects'
  | 'knowledge'
  | 'canvas'
  | 'images'
  | 'research'
  | 'automation'
  | 'agents'
  | 'dashboard'
  | 'settings'
  | 'analytics'
  | 'memory';

const PRIMARY_NAV: { icon: typeof MessageSquare; label: string; action: NavAction }[] = [
  { icon: MessageSquare, label: 'Chats', action: 'chat' },
  { icon: Search, label: 'Search', action: 'search' },
  { icon: FolderKanban, label: 'Projects', action: 'projects' },
];

const WORKSPACE_NAV: { icon: typeof MessageSquare; label: string; action: NavAction }[] = [
  { icon: BookOpen, label: 'Knowledge', action: 'knowledge' },
  { icon: PanelsTopLeft, label: 'Canvas', action: 'canvas' },
  { icon: ImageIcon, label: 'Images', action: 'images' },
  { icon: Search, label: 'Research', action: 'research' },
  { icon: Zap, label: 'Automation', action: 'automation' },
  { icon: Bot, label: 'Agents', action: 'agents' },
  { icon: Brain, label: 'Memory', action: 'memory' },
  { icon: LayoutDashboard, label: 'Dashboard', action: 'dashboard' },
];

interface ProjectListItemProps {
  project: Project;
  isActive: boolean;
  menuOpen: boolean;
  uploading: boolean;
  onOpen: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onAddKnowledge: (projectId: string) => void;
  onPinProject?: (projectId: string, pinned: boolean) => Promise<void> | void;
  onRenameProject?: (projectId: string, name: string) => Promise<void> | void;
  onSaveMemory?: (
    projectId: string,
    memory: { category: string; key: string; value: string }
  ) => Promise<void> | void;
  onDuplicateProject?: (projectId: string) => Promise<void> | void;
  onArchiveProject?: (projectId: string) => Promise<void> | void;
  onDeleteProject?: (projectId: string) => Promise<void> | void;
}

function ProjectListItem({
  project,
  isActive,
  menuOpen,
  uploading,
  onOpen,
  onToggleMenu,
  onCloseMenu,
  onAddKnowledge,
  onPinProject,
  onRenameProject,
  onSaveMemory,
  onDuplicateProject,
  onArchiveProject,
  onDeleteProject,
}: ProjectListItemProps) {
  const menuItems = [
    {
      label: project.pinned ? 'Unpin' : 'Pin',
      icon: Pin,
      onClick: () => onPinProject?.(project._id, !project.pinned),
    },
    {
      label: 'Rename',
      icon: Pencil,
      onClick: async () => {
        const name = window.prompt('Rename project', project.name);
        if (name?.trim()) await onRenameProject?.(project._id, name.trim());
      },
    },
    {
      label: uploading ? 'Indexing…' : 'Add knowledge',
      icon: Upload,
      onClick: () => onAddKnowledge(project._id),
    },
    {
      label: 'Add memory',
      icon: Brain,
      onClick: async () => {
        const category =
          window.prompt(
            'Category: preference | writing_style | coding_style | goal | decision | fact',
            'fact'
          ) || 'fact';
        const key = window.prompt('Memory key (e.g. coding_style)');
        const value = key ? window.prompt('Memory value') : null;
        if (key?.trim() && value?.trim()) {
          await onSaveMemory?.(project._id, {
            category: category.trim(),
            key: key.trim(),
            value: value.trim(),
          });
        }
      },
    },
    {
      label: 'Duplicate',
      icon: Copy,
      onClick: () => onDuplicateProject?.(project._id),
    },
    {
      label: 'Archive',
      icon: Archive,
      onClick: () => onArchiveProject?.(project._id),
    },
    {
      label: 'Delete',
      icon: Trash2,
      onClick: () => {
        if (window.confirm(`Delete “${project.name}”?`)) {
          void onDeleteProject?.(project._id);
        }
      },
    },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-center gap-2 rounded-xs px-3.5 py-2 text-left',
          'text-secondary tracking-[-0.014em]',
          'transition-all duration-fast ease-out',
          isActive
            ? 'bg-primary/[0.06] font-medium text-primary'
            : 'text-foreground/60 hover:bg-surface-hover hover:text-foreground'
        )}
      >
        <FolderKanban size={13} strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        {project.pinned && <Pin size={11} className="shrink-0 opacity-60" />}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onToggleMenu();
            }
          }}
          className="rounded-md p-0.5 opacity-50 transition-opacity duration-fast hover:bg-surface-hover hover:opacity-100"
          aria-label="Project actions"
        >
          <MoreHorizontal size={13} />
        </span>
      </button>

      {menuOpen && (
        <div
          className={cn(
            'absolute right-2 top-9 z-20 w-[168px] overflow-hidden rounded-[14px]',
            'menu-surface overflow-hidden rounded-[14px] shadow-token-lg'
          )}
        >
          {menuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={async () => {
                onCloseMenu();
                await item.onClick();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-foreground/80 hover:bg-surface-hover"
            >
              <item.icon size={13} strokeWidth={1.75} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({
  isOpen,
  onClose,
  onOpen,
  recentChats = [],
  isLoadingChats = false,
  chatsError = null,
  chatsQuery = '',
  onSearchChats,
  onRenameChat,
  onDeleteChat,
  onPinChat,
  hasMoreChats = false,
  isLoadingMoreChats = false,
  onLoadMoreChats,
  onNewChat,
  projects = [],
  pinnedProjects = [],
  activeProjectId = null,
  projectChats = [],
  activeChatId = null,
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
  showAnalytics = false,
  messages = [],
  conversationTitle = 'Conversation',
  shareableChatId = null,
  hasArtifact = false,
  isArtifactOpen = false,
  onShowArtifact,
  hasCanvas = false,
  isCanvasOpen = false,
  onShowCanvas,
  hasBrowser = false,
  isBrowserOpen = false,
  onShowBrowser,
  hasCodeInterpreter = false,
  isCodeInterpreterOpen = false,
  onShowCodeInterpreter,
}: SidebarProps) {
  const { theme, toggleTheme, mounted } = useThemeContext();
  const [projectQuery, setProjectQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeNav, setActiveNav] = useState<NavAction>('chat');
  const knowledgeInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const projectsSectionRef = useRef<HTMLElement>(null);
  const historySectionRef = useRef<HTMLDivElement>(null);

  const bottomActionClass = cn(
    'hover-lift flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5',
    'text-sidebar font-medium text-text-secondary',
    'transition-all duration-normal ease-apple',
    'hover:bg-surface-hover hover:text-foreground'
  );

  const toolBtnClass = (active: boolean) =>
    cn(
      'hover-lift flex w-full items-center gap-3 rounded-[12px] px-3 py-2',
      'text-[13px] font-medium tracking-[-0.014em]',
      'transition-all duration-normal ease-out',
      active
        ? 'bg-primary/[0.1] text-primary'
        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
    );

  const hasConversationTools =
    (hasCodeInterpreter && onShowCodeInterpreter) ||
    (hasBrowser && onShowBrowser) ||
    (hasCanvas && onShowCanvas) ||
    (hasArtifact && onShowArtifact) ||
    messages.length > 0 ||
    !!shareableChatId;

  const handleNewChat = useCallback(() => {
    onNewChat?.();
    if (window.innerWidth < 768) onClose();
  }, [onNewChat, onClose]);

  // Conversation search always targets personal chats, so jumping into it
  // while a project is open first clears the project filter — otherwise the
  // list you'd be searching (project chats) wouldn't match what's in the
  // search box (which only ever queries `recentChats`).
  const focusSearch = useCallback(() => {
    if (activeProjectId) onSelectProject?.(null);
    if (window.innerWidth < 768) onOpen?.();
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [activeProjectId, onSelectProject, onOpen]);

  // Global shortcuts: ⌘⇧O / Ctrl+Shift+O starts a new chat.
  // ⌘K / Ctrl+K is owned by the command palette (global search).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'o' && e.shiftKey) {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat]);

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await onCreateProject?.(name);
    setNewName('');
    setCreating(false);
  };

  const handleKnowledgePick = async (fileList: FileList | null) => {
    const projectId = uploadTargetRef.current;
    if (!projectId || !fileList?.length || !onUploadKnowledge) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const kind = getAttachmentKind(file);
        const mimeType = resolveMimeType(file, kind);
        const dataBase64 = await readFileAsBase64(file, () => {});
        await onUploadKnowledge(projectId, {
          name: file.name,
          mimeType,
          size: file.size,
          kind,
          dataBase64,
        });
      }
    } finally {
      setUploading(false);
      uploadTargetRef.current = null;
      if (knowledgeInputRef.current) knowledgeInputRef.current.value = '';
    }
  };

  const startKnowledgeUpload = useCallback((projectId: string) => {
    uploadTargetRef.current = projectId;
    knowledgeInputRef.current?.click();
  }, []);

  const visibleProjects = projectQuery
    ? projects.filter((p) =>
        `${p.name} ${p.description || ''}`.toLowerCase().includes(projectQuery.toLowerCase())
      )
    : projects;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-0 z-40 modal-overlay md:hidden"
            onClick={onClose}
 />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          'fixed z-50 flex flex-col',
          'inset-y-0 left-0 w-[280px] md:w-auto',
          'transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          'md:relative md:shrink-0 md:py-4 md:pl-4 md:pr-0'
        )}
      >
        <div
          className={cn(
            'flex h-full flex-col overflow-hidden',
            'bg-surface-glass',
            'backdrop-blur-[var(--blur-glass)] backdrop-saturate-[1.8]',
            'border border-border',
            'shadow-2',
            'md:h-[calc(100vh-32px)] md:w-[272px]',
            'rounded-none md:rounded-[var(--radius-lg)]'
          )}
        >
          {/* Brand */}
          <div className="flex items-center gap-3 px-4 pt-5 pb-3">
            <VaniLogo size="sm" glow />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold tracking-[-0.028em] text-foreground">
                VANI
              </div>
              <div className="text-[11px] font-medium tracking-[-0.01em] text-text-tertiary">
                AI Operating System
              </div>
            </div>
          </div>

          {/* Search */}
          <SidebarSearch ref={searchInputRef} value={chatsQuery} onChange={(q) => onSearchChats?.(q)} />

          {/* New Chat */}
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={handleNewChat}
              className={cn(
                'btn-ripple group flex w-full items-center justify-between rounded-full',
                'bg-accent text-text-on-accent',
                'px-4 py-2.5 text-[14px] font-semibold tracking-[-0.016em]',
                'shadow-[0_4px_20px_rgba(107,92,255,0.28)]',
                'transition-all duration-normal ease-apple',
                'hover:bg-accent-hover hover:shadow-[0_6px_28px_rgba(107,92,255,0.36)] active:scale-[0.985]'
              )}
            >
              <span className="flex items-center gap-2.5">
                <Plus size={15} strokeWidth={2.25} />
                New Chat
              </span>
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  'bg-white/18 text-text-on-accent/90'
                )}
              >
                ⌘⇧O
              </span>
            </button>
          </div>

          <div className="vani-divider mx-4" />

          {/* AI */}
          <SidebarNavSection id="ai" title="AI" className="px-1.5">
            <nav className="space-y-0.5 px-1" aria-label="AI">
              {PRIMARY_NAV.map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  type="button"
                  data-active={activeNav === action}
                  onClick={() => {
                    if (action === 'chat') {
                      setActiveNav('chat');
                      onSelectProject?.(null);
                      historySectionRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                      if (window.innerWidth < 768) onClose();
                      return;
                    }
                    if (action === 'search') {
                      setActiveNav('search');
                      focusSearch();
                      return;
                    }
                    if (action === 'projects') {
                      setActiveNav('projects');
                      projectsSectionRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                      return;
                    }
                  }}
                  className="sidebar-row"
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </nav>
          </SidebarNavSection>

          {/* More — secondary workspace destinations, collapsed by default */}
          <SidebarNavSection id="more" title="More" defaultOpen={false} className="px-1.5">
            <nav className="space-y-0.5 px-1" aria-label="More">
              {[
                ...WORKSPACE_NAV,
                ...(showAnalytics
                  ? [{ icon: BarChart3, label: 'Analytics', action: 'analytics' as const }]
                  : []),
              ].map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  type="button"
                  data-active={activeNav === action}
                  onClick={() => {
                    setActiveNav(action);
                    const closeMobile = () => {
                      if (window.innerWidth < 768) onClose();
                    };

                    if (action === 'knowledge') {
                      onOpenKnowledge?.();
                      closeMobile();
                      return;
                    }
                    if (action === 'canvas') {
                      (onOpenCanvasWorkspace || onShowCanvas)?.();
                      closeMobile();
                      return;
                    }
                    if (action === 'images') {
                      onOpenImages?.();
                      closeMobile();
                      return;
                    }
                    if (action === 'research') {
                      onOpenResearch?.();
                      closeMobile();
                      return;
                    }
                    if (action === 'automation') {
                      onOpenAutomation?.();
                      closeMobile();
                      return;
                    }
                    if (action === 'agents') {
                      (onOpenAgents || onOpenSettings)?.();
                      closeMobile();
                      return;
                    }
                    if (action === 'memory') {
                      onOpenMemory?.();
                      closeMobile();
                      return;
                    }
                    if (action === 'dashboard') {
                      onOpenDashboard?.();
                      closeMobile();
                      return;
                    }
                    if (action === 'analytics') {
                      onOpenAnalytics?.();
                      closeMobile();
                      return;
                    }
                  }}
                  className="sidebar-row"
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </nav>
          </SidebarNavSection>

          <div className="vani-divider mx-4 mt-1" />

          {/* Projects + Recent chats */}
          <div className="custom-scrollbar mt-2 flex-1 space-y-5 overflow-y-auto px-2.5 py-1">
            <SidebarNavSection
              id="projects"
              title="Projects"
              trailing={
                <button
                  type="button"
                  onClick={() => setCreating((v) => !v)}
                  className="mr-1 rounded-full p-1 text-muted-foreground/60 hover:bg-surface-hover hover:text-foreground"
                  aria-label="Create project"
                >
                  <Plus size={13} strokeWidth={2} />
                </button>
              }
            >
              <section ref={projectsSectionRef}>

              <div className="mb-2 px-1">
                <div className="relative">
                  <Search
                    size={12}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/45"
 />
                  <input
                    value={projectQuery}
                    onChange={(e) => {
                      setProjectQuery(e.target.value);
                      onSearchProjects?.(e.target.value);
                    }}
                    placeholder="Search projects"
                    className={cn(
                      'w-full rounded-[12px] bg-surface-hover',
                      'border border-transparent py-1.5 pl-8 pr-3',
                      'text-[12px] tracking-[-0.014em] text-foreground outline-none',
                      'placeholder:text-muted-foreground/40',
                      'focus:border-black/[0.06] dark:focus:border-white/[0.08]'
                    )}
 />
                </div>
              </div>

              {creating && (
                <div className="mb-2 flex items-center gap-1.5 px-1">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submitCreate();
                      if (e.key === 'Escape') setCreating(false);
                    }}
                    placeholder="Project name"
                    className={cn(
                      'min-w-0 flex-1 rounded-[12px] bg-surface-hover',
                      'px-3 py-1.5 text-[12.5px] outline-none'
                    )}
 />
                  <button
                    type="button"
                    onClick={() => void submitCreate()}
                    className="rounded-full bg-primary px-2.5 py-1.5 text-[11px] font-medium text-white"
                  >
                    Add
                  </button>
                </div>
              )}

              {!!pinnedProjects.length && !projectQuery && (
                <div className="mb-1.5 px-3.5 text-[10px] font-medium tracking-[0.04em] text-muted-foreground/35">
                  Pinned
                </div>
              )}

              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => onSelectProject?.(null)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xs px-3.5 py-2 text-left',
                    'text-secondary tracking-[-0.014em]',
                    'transition-all duration-fast ease-out',
                    !activeProjectId
                      ? 'bg-primary/[0.06] font-medium text-primary'
                      : 'text-foreground/60 hover:bg-surface-hover hover:text-foreground'
                  )}
                >
                  <MessageSquare size={13} strokeWidth={1.75} />
                  <span className="truncate">Personal chats</span>
                </button>

                {(projectQuery ? visibleProjects : [...pinnedProjects, ...visibleProjects.filter((p) => !p.pinned)])
                  .filter((p, i, arr) => arr.findIndex((x) => x._id === p._id) === i)
                  .slice(0, 20)
                  .map((project) => (
                    <ProjectListItem
                      key={project._id}
                      project={project}
                      isActive={activeProjectId === project._id}
                      menuOpen={menuId === project._id}
                      uploading={uploading}
                      onOpen={() => {
                        onSelectProject?.(project._id);
                        setMenuId(null);
                        if (window.innerWidth < 768) onClose();
                      }}
                      onToggleMenu={() =>
                        setMenuId((id) => (id === project._id ? null : project._id))
                      }
                      onCloseMenu={() => setMenuId(null)}
                      onAddKnowledge={startKnowledgeUpload}
                      onPinProject={onPinProject}
                      onRenameProject={onRenameProject}
                      onSaveMemory={onSaveMemory}
                      onDuplicateProject={onDuplicateProject}
                      onArchiveProject={onArchiveProject}
                      onDeleteProject={onDeleteProject}
 />
                  ))}
              </div>
            </section>
            </SidebarNavSection>

            {activeProjectId ? (
              <section ref={historySectionRef}>
                <div className="mb-2 flex items-center justify-between px-3.5">
                  <div className="os-section-label px-0.5">Project chats</div>
                  <button
                    type="button"
                    onClick={() => onSelectProject?.(null)}
                    className="rounded-full p-0.5 text-muted-foreground/50 hover:text-foreground"
                    aria-label="Clear project filter"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="space-y-0.5">
                  {projectChats.length ? (
                    projectChats.map((chat) => (
                      <ChatHistoryItem
                        key={chat.id}
                        chat={chat}
                        isActive={activeChatId === chat.id}
                        query={chatsQuery}
                        onSelect={(id) => {
                          onSelectChat?.(id);
                          if (window.innerWidth < 768) onClose();
                        }}
                        onRename={onRenameChat}
                        onDelete={onDeleteChat}
                        onPin={onPinChat}
 />
                    ))
                  ) : (
                    <p className="px-3.5 py-2 text-[12px] text-muted-foreground/50">
                      No chats in this project yet.
                    </p>
                  )}
                </div>
              </section>
            ) : (
              <div ref={historySectionRef}>
                <ChatHistorySection
                  chats={recentChats}
                  isLoading={isLoadingChats}
                  error={chatsError}
                  query={chatsQuery}
                  activeChatId={activeChatId}
                  onSelectChat={(id) => {
                    onSelectChat?.(id);
                    if (window.innerWidth < 768) onClose();
                  }}
                  onRenameChat={onRenameChat}
                  onDeleteChat={onDeleteChat}
                  onPinChat={onPinChat}
                  hasMore={hasMoreChats}
                  isLoadingMore={isLoadingMoreChats}
                  onLoadMore={onLoadMoreChats}
 />
              </div>
            )}
          </div>

          <input
            ref={knowledgeInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.markdown,.csv,.xlsx,.xls,.jpg,.jpeg,.png,.webp,application/pdf,text/plain,text/markdown,text/csv,image/*"
            className="hidden"
            onChange={(e) => void handleKnowledgePick(e.target.files)}
 />

          {/* Bottom — Tools · Personal */}
          <div className="mt-auto space-y-0.5 border-t border-divider px-2.5 py-3">
            {hasConversationTools && (
              <SidebarNavSection id="tools" title="Tools" className="mb-1">
                <div className="space-y-0.5 px-0.5">
                {hasCodeInterpreter && onShowCodeInterpreter && (
                  <button
                    type="button"
                    onClick={() => {
                      onShowCodeInterpreter();
                      if (window.innerWidth < 768) onClose();
                    }}
                    className={toolBtnClass(isCodeInterpreterOpen)}
                  >
                    <TerminalSquare size={15} strokeWidth={1.75} />
                    Code
                  </button>
                )}
                {hasBrowser && onShowBrowser && (
                  <button
                    type="button"
                    onClick={() => {
                      onShowBrowser();
                      if (window.innerWidth < 768) onClose();
                    }}
                    className={toolBtnClass(isBrowserOpen)}
                  >
                    <Globe2 size={15} strokeWidth={1.75} />
                    Browser
                  </button>
                )}
                {hasCanvas && onShowCanvas && (
                  <button
                    type="button"
                    onClick={() => {
                      onShowCanvas();
                      if (window.innerWidth < 768) onClose();
                    }}
                    className={toolBtnClass(isCanvasOpen)}
                  >
                    <PanelsTopLeft size={15} strokeWidth={1.75} />
                    Canvas
                  </button>
                )}
                {hasArtifact && onShowArtifact && (
                  <button
                    type="button"
                    onClick={() => {
                      onShowArtifact();
                      if (window.innerWidth < 768) onClose();
                    }}
                    className={toolBtnClass(isArtifactOpen)}
                  >
                    <FileCode2 size={15} strokeWidth={1.75} />
                    Artifact
                  </button>
                )}
                {(messages.length > 0 || shareableChatId) && (
                  <div className="flex items-center gap-1 px-1 pt-1">
                    <ShareMenu chatId={shareableChatId} />
                    <ExportMenu messages={messages} conversationTitle={conversationTitle} />
                  </div>
                )}
                </div>
              </SidebarNavSection>
            )}

            <SidebarNavSection id="personal" title="Personal" defaultOpen>
              <div className="space-y-0.5 px-0.5">
            <UserMenu variant="sidebar" />

            <button
              type="button"
              onClick={() => {
                onOpenSettings?.();
                if (window.innerWidth < 768) onClose();
              }}
              className={bottomActionClass}
              aria-label="Settings"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-surface-hover text-text-secondary">
                <Settings size={14} strokeWidth={1.75} />
              </span>
              Settings
            </button>

            <button
              type="button"
              onClick={() => {
                (onOpenBilling || onOpenSettings)?.();
                if (window.innerWidth < 768) onClose();
              }}
              className={bottomActionClass}
              aria-label="VANI Pro"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent-muted text-accent">
                <Crown size={14} strokeWidth={2} />
              </span>
              VANI Pro
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className={bottomActionClass}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-surface-hover text-text-secondary">
                {mounted && theme === 'dark' ? (
                  <Sun size={14} strokeWidth={1.75} />
                ) : (
                  <Moon size={14} strokeWidth={1.75} />
                )}
              </span>
              Theme
            </button>
              </div>
            </SidebarNavSection>
          </div>
        </div>
      </aside>
    </>
  );
}

// Re-export as memo to skip re-renders when parent updates unrelated chat/voice state.
const SidebarMemo = memo(Sidebar);
export { SidebarMemo as default };
