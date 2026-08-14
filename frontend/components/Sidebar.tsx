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
  ImageIcon,
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
import SidebarSearchPanel from '@/components/sidebar/SidebarSearchPanel';
import SidebarNavSection from '@/components/sidebar/SidebarNavSection';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import UserMenu from '@/components/auth/UserMenu';
import dynamic from 'next/dynamic';
import ShareMenu from '@/components/chat/ShareMenu';
import { useThemeContext } from '@/components/layout/ThemeProvider';
import VaniLogo from '@/components/brand/VaniLogo';
import {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_TRANSITION_MS,
  useSidebarWidth,
} from '@/hooks/useSidebarWidth';
import { SPRING } from '@/lib/motion';

/** PDF/export libs stay off the critical path until the user opens export. */
const ExportMenu = dynamic(() => import('@/components/chat/ExportMenu'), {
  ssr: false,
  loading: () => (
    <span
      className="inline-flex h-9 w-9 items-center justify-center rounded-full"
      aria-hidden
    >
      <span className="h-4 w-4 animate-pulse rounded bg-surface-hover" />
    </span>
  ),
});

const MOBILE_DRAWER_WIDTH = 300;

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called to reveal the mobile drawer (e.g. from the ⌘K/Ctrl+K shortcut) — a no-op on desktop, where the sidebar is always visible. */
  onOpen?: () => void;
  /** Desktop icon rail — true = 80px collapsed. */
  isCollapsed?: boolean;
  /** Toggles desktop expand/collapse. */
  onToggleCollapsed?: () => void;
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
  const confirm = useConfirm();
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
        void (async () => {
          const ok = await confirm({
            title: `Delete “${project.name}”?`,
            description: 'This permanently removes the project and its knowledge files.',
            confirmLabel: 'Delete',
            variant: 'danger',
          });
          if (ok) void onDeleteProject?.(project._id);
        })();
      },
    },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-center gap-2 rounded-xs px-3.5 py-2.5 text-left sidebar-row pressable',
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
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-caption text-foreground/80 hover:bg-surface-hover"
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
  isCollapsed = false,
  onToggleCollapsed,
  recentChats = [],
  isLoadingChats = false,
  chatsError = null,
  chatsQuery: _chatsQuery = '',
  onSearchChats: _onSearchChats,
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
  const [isDesktop, setIsDesktop] = useState(false);
  const [mqReady, setMqReady] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const knowledgeInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);
  const projectsSectionRef = useRef<HTMLElement>(null);
  const historySectionRef = useRef<HTMLDivElement>(null);
  const {
    width: expandedWidth,
    isResizing,
    resetWidth,
    onResizeStart,
  } = useSidebarWidth();

  // Collapse is a desktop icon-rail only — mobile drawer always shows full content.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => {
      setIsDesktop(mq.matches);
      setMqReady(true);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const rail = isCollapsed && isDesktop;
  const desktopWidth = rail ? SIDEBAR_WIDTH_COLLAPSED : expandedWidth;
  const useMotionDrawer = mqReady && !isDesktop;

  const bottomActionClass = cn(
    'hover-lift flex w-full items-center rounded-[12px]',
    rail ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
    'text-sidebar font-medium text-text-secondary',
    'transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
    'hover:bg-surface-hover hover:text-foreground'
  );

  const toolBtnClass = (active: boolean) =>
    cn(
      'hover-lift flex w-full items-center rounded-[12px]',
      rail ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2',
      'text-sm font-medium tracking-[-0.014em]',
      'transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
      active
        ? 'bg-primary/[0.1] text-primary'
        : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
    );

  const navRowClass = cn('sidebar-row', rail && 'sidebar-row--collapsed');

  const workspaceNav = [
    ...(onOpenImages ? [{ icon: ImageIcon, label: 'Images', action: 'images' as const }] : []),
    ...(onOpenCanvasWorkspace || onShowCanvas
      ? [{ icon: PanelsTopLeft, label: 'Canvas', action: 'canvas' as const }]
      : []),
    ...(onOpenAutomation
      ? [{ icon: Zap, label: 'Browser', action: 'automation' as const }]
      : []),
    ...(onOpenMemory ? [{ icon: Brain, label: 'Memory', action: 'memory' as const }] : []),
    ...(showAnalytics && onOpenAnalytics
      ? [{ icon: BarChart3, label: 'Analytics', action: 'analytics' as const }]
      : []),
  ];

  const hasExportable = messages.some(
    (m) => m.content.trim() || m.attachments?.length
  );
  const hasShare = Boolean(shareableChatId);
  const hasConversationTools =
    (hasCodeInterpreter && onShowCodeInterpreter) ||
    (hasBrowser && onShowBrowser) ||
    (hasCanvas && onShowCanvas) ||
    (hasArtifact && onShowArtifact) ||
    hasExportable ||
    hasShare;

  const expandIfCollapsed = useCallback(() => {
    if (rail) onToggleCollapsed?.();
  }, [rail, onToggleCollapsed]);

  const handleNewChat = useCallback(() => {
    onNewChat?.();
    if (window.innerWidth < 768) onClose();
  }, [onNewChat, onClose]);

  // Conversation search opens a floating panel over the app — not an inline box.
  const openSearch = useCallback(() => {
    setActiveNav('search');
    setSearchOpen(true);
    if (window.innerWidth < 768) onClose();
  }, [onClose]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setActiveNav((nav) => (nav === 'search' ? 'chat' : nav));
  }, []);

  const handleWorkspaceAction = useCallback(
    (action: NavAction) => {
      setActiveNav(action);
      const closeMobile = () => {
        if (window.innerWidth < 768) onClose();
      };
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
      if (action === 'automation') {
        onOpenAutomation?.();
        closeMobile();
        return;
      }
      if (action === 'memory') {
        onOpenMemory?.();
        closeMobile();
        return;
      }
      if (action === 'analytics') {
        onOpenAnalytics?.();
        closeMobile();
      }
    },
    [
      onClose,
      onOpenCanvasWorkspace,
      onShowCanvas,
      onOpenImages,
      onOpenAutomation,
      onOpenMemory,
      onOpenAnalytics,
    ]
  );

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

  /** Hide projects with no chats and no files (unless pinned or active). */
  const listedProjects = (projectQuery
    ? visibleProjects
    : [...pinnedProjects, ...visibleProjects.filter((p) => !p.pinned)]
  )
    .filter((p, i, arr) => arr.findIndex((x) => x._id === p._id) === i)
    .filter((p) => {
      if (p.pinned || p._id === activeProjectId) return true;
      if (!p.stats) return true;
      const chats = p.stats.chatCount ?? 0;
      const files = p.stats.fileCount ?? 0;
      return chats > 0 || files > 0;
    })
    .slice(0, 20);

  return (
    <>
      <AnimatePresence>
        {isOpen && !isDesktop ? (
          <motion.div
            key="sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-0 z-40 modal-overlay md:hidden"
            onClick={onClose}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      <motion.aside
        className={cn(
          'fixed z-50 flex flex-col',
          'inset-y-0 left-0',
          /* Mobile: overlay drawer only — never consume main flex width */
          'w-[min(300px,86vw)] max-md:max-w-[86vw]',
          'md:w-auto',
          isDesktop &&
            'transition-[width] duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)]',
          isResizing && 'duration-0',
          /* Before mq resolves (and on desktop): CSS transform like the original.
             After mq resolves on mobile: framer-motion owns X for swipe. */
          !useMotionDrawer &&
            (isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'),
          useMotionDrawer &&
            cn('will-change-transform touch-pan-y', !isOpen && 'pointer-events-none'),
          /* Desktop only joins the flex row; mobile stays fixed overlay */
          'md:relative md:shrink-0 md:py-4',
          isOpen ? 'max-md:pointer-events-auto' : 'max-md:pointer-events-none',
          rail ? 'md:pl-2 md:pr-2' : 'md:pl-4 md:pr-0'
        )}
        style={
          !mqReady
            ? undefined
            : isDesktop
              ? {
                  width: desktopWidth,
                  transitionDuration: isResizing
                    ? '0ms'
                    : `${SIDEBAR_WIDTH_TRANSITION_MS}ms`,
                }
              : { width: MOBILE_DRAWER_WIDTH }
        }
        initial={false}
        animate={
          useMotionDrawer
            ? { x: isOpen ? 0 : -MOBILE_DRAWER_WIDTH - 24 }
            : { x: 0 }
        }
        transition={useMotionDrawer ? SPRING.snappy : { duration: 0 }}
        drag={useMotionDrawer && isOpen ? 'x' : false}
        dragConstraints={{ left: -MOBILE_DRAWER_WIDTH, right: 0 }}
        dragElastic={{ left: 0.12, right: 0.02 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (!useMotionDrawer) return;
          if (info.offset.x < -72 || info.velocity.x < -420) {
            onClose();
          }
        }}
        data-state={isOpen ? 'open' : 'closed'}
        data-collapsed={rail || undefined}
        data-sidebar-width={isDesktop ? desktopWidth : MOBILE_DRAWER_WIDTH}
        aria-hidden={useMotionDrawer && !isOpen ? true : undefined}
      >
        <div
          className={cn(
            'relative flex h-full w-full flex-col overflow-hidden',
            'bg-surface-glass',
            'backdrop-blur-[var(--blur-glass)] backdrop-saturate-[1.8]',
            'border border-border',
            'shadow-2',
            'md:h-[calc(100vh-32px)]',
            'rounded-none md:rounded-[var(--radius-lg)]',
            'max-md:pt-12 max-md:pb-8'
          )}
        >
          {/* Brand + New Chat — stacked, never overlapping */}
          <div
            className={cn(
              'flex shrink-0 flex-col',
              rail ? 'items-center gap-3 px-2 pt-4 pb-3' : 'gap-3.5 px-3.5 pt-4 pb-3'
            )}
          >
            {rail ? (
              <VaniLogo size="sm" glow />
            ) : (
              <div className="flex w-full min-w-0 items-center gap-3">
                <div className="shrink-0">
                  <VaniLogo size="sm" glow />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-semibold leading-tight tracking-[-0.028em] text-foreground">
                    VANI
                  </div>
                  <div className="mt-0.5 truncate text-micro font-medium leading-tight tracking-[-0.01em] text-text-tertiary">
                    AI Operating System
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleNewChat}
              className={cn(
                'btn-ripple group flex shrink-0 items-center',
                rail
                  ? 'h-10 w-10 justify-center rounded-full'
                  : 'w-full justify-between rounded-full px-4 py-2.5',
                'bg-accent text-text-on-accent',
                'text-sidebar font-semibold tracking-[-0.016em]',
                'shadow-[0_4px_20px_var(--accent-glow)]',
                'transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
                'hover:bg-accent-hover hover:shadow-[0_6px_28px_var(--accent-glow)] active:scale-[0.985]'
              )}
              aria-label="New Chat"
              title="New Chat"
            >
              {rail ? (
                <Plus size={18} strokeWidth={2.25} />
              ) : (
                <>
                  <span className="flex items-center gap-2.5">
                    <Plus size={15} strokeWidth={2.25} />
                    New Chat
                  </span>
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-micro font-semibold tabular-nums',
                      'bg-white/18 text-text-on-accent/90'
                    )}
                  >
                    ⌘⇧O
                  </span>
                </>
              )}
            </button>
          </div>

          {!rail ? <div className="vani-divider mx-4" /> : null}

          {/* AI */}
          <SidebarNavSection
            id="ai"
            title="AI"
            className={cn('px-1.5', rail && '[&_.sidebar-section-trigger]:hidden')}
            defaultOpen
          >
            <nav className={cn('space-y-0.5', rail ? 'px-1' : 'px-1')} aria-label="AI">
              {PRIMARY_NAV.map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  type="button"
                  data-active={activeNav === action}
                  title={label}
                  aria-label={label}
                  onClick={() => {
                    if (action === 'chat') {
                      setActiveNav('chat');
                      expandIfCollapsed();
                      onSelectProject?.(null);
                      requestAnimationFrame(() => {
                        historySectionRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      });
                      if (window.innerWidth < 768) onClose();
                      return;
                    }
                    if (action === 'search') {
                      openSearch();
                      return;
                    }
                    if (action === 'projects') {
                      setActiveNav('projects');
                      expandIfCollapsed();
                      requestAnimationFrame(() => {
                        projectsSectionRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      });
                    }
                  }}
                  className={navRowClass}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {!rail ? label : null}
                </button>
              ))}
            </nav>
          </SidebarNavSection>

          {/* More — secondary workspace destinations, collapsed by default */}
          {rail ? (
            workspaceNav.length > 0 ? (
            <nav className="mt-1 space-y-0.5 px-1" aria-label="More">
              {workspaceNav.map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  type="button"
                  data-active={activeNav === action}
                  title={label}
                  aria-label={label}
                  onClick={() => handleWorkspaceAction(action)}
                  className={navRowClass}
                >
                  <Icon size={16} strokeWidth={1.75} />
                </button>
              ))}
            </nav>
            ) : null
          ) : workspaceNav.length > 0 ? (
          <SidebarNavSection id="more" title="More" defaultOpen={false} className="px-1.5">
            <nav className="space-y-0.5 px-1" aria-label="More">
              {workspaceNav.map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  type="button"
                  data-active={activeNav === action}
                  onClick={() => handleWorkspaceAction(action)}
                  className={navRowClass}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </nav>
          </SidebarNavSection>
          ) : null}

          {!rail ? <div className="vani-divider mx-4 mt-1" /> : null}

          {/* Projects + Recent chats */}
          <div
            className={cn(
              'custom-scrollbar mt-2 flex-1 space-y-5 overflow-y-auto py-1',
              rail ? 'hidden' : 'px-2.5'
            )}
          >
            <SidebarNavSection
              id="projects"
              title="Projects"
              defaultOpen={false}
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
                {projects.length > 0 || projectQuery ? (
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
                      'text-caption tracking-[-0.014em] text-foreground',
                      'placeholder:text-muted-foreground/40',
                      'focus:border-black/[0.06] dark:focus:border-white/[0.08]'
                    )}
 />
                </div>
                ) : null}
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
                      'px-3 py-1.5 text-sm'
                    )}
 />
                  <button
                    type="button"
                    onClick={() => void submitCreate()}
                    className="rounded-full bg-primary px-2.5 py-1.5 text-micro font-medium text-white"
                  >
                    Add
                  </button>
                </div>
              )}

              {!!pinnedProjects.length && !projectQuery && listedProjects.some((p) => p.pinned) && (
                <div className="mb-1.5 px-3.5 text-micro font-medium tracking-[0.04em] text-muted-foreground/35">
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

                {listedProjects.map((project) => (
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
                        query=""
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
                    <PremiumEmpty
                      size="sm"
                      icon={MessageSquare}
                      title="No chats in this project yet"
                      description="Start a conversation in this project and it’ll show up here."
                      className="px-2 py-4"
                    />
                  )}
                </div>
              </section>
            ) : (
              <div ref={historySectionRef}>
                <ChatHistorySection
                  chats={recentChats}
                  isLoading={isLoadingChats}
                  error={chatsError}
                  query=""
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
          {rail ? <div className="min-h-0 flex-1" aria-hidden /> : null}

          <input
            ref={knowledgeInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.markdown,.csv,.xlsx,.xls,.jpg,.jpeg,.png,.webp,application/pdf,text/plain,text/markdown,text/csv,image/*"
            className="hidden"
            onChange={(e) => void handleKnowledgePick(e.target.files)}
 />

          {/* Bottom — Tools · Personal */}
          <div
            className={cn(
              'mt-auto space-y-0.5 border-t border-divider py-3',
              rail ? 'px-1.5' : 'px-2.5'
            )}
          >
            {hasConversationTools && !rail && (
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
                {(hasShare || hasExportable) && (
                  <div className="flex items-center gap-1 px-1 pt-1">
                    {hasShare ? <ShareMenu chatId={shareableChatId} /> : null}
                    {hasExportable ? (
                      <ExportMenu messages={messages} conversationTitle={conversationTitle} />
                    ) : null}
                  </div>
                )}
                </div>
              </SidebarNavSection>
            )}

            {hasConversationTools && rail && (
              <div className="mb-1 space-y-0.5">
                {hasCodeInterpreter && onShowCodeInterpreter ? (
                  <button
                    type="button"
                    title="Code"
                    aria-label="Code"
                    onClick={() => {
                      onShowCodeInterpreter();
                      if (window.innerWidth < 768) onClose();
                    }}
                    className={toolBtnClass(isCodeInterpreterOpen)}
                  >
                    <TerminalSquare size={15} strokeWidth={1.75} />
                  </button>
                ) : null}
                {hasBrowser && onShowBrowser ? (
                  <button
                    type="button"
                    title="Browser"
                    aria-label="Browser"
                    onClick={() => {
                      onShowBrowser();
                      if (window.innerWidth < 768) onClose();
                    }}
                    className={toolBtnClass(isBrowserOpen)}
                  >
                    <Globe2 size={15} strokeWidth={1.75} />
                  </button>
                ) : null}
                {hasCanvas && onShowCanvas ? (
                  <button
                    type="button"
                    title="Canvas"
                    aria-label="Canvas"
                    onClick={() => {
                      onShowCanvas();
                      if (window.innerWidth < 768) onClose();
                    }}
                    className={toolBtnClass(isCanvasOpen)}
                  >
                    <PanelsTopLeft size={15} strokeWidth={1.75} />
                  </button>
                ) : null}
                {hasArtifact && onShowArtifact ? (
                  <button
                    type="button"
                    title="Artifact"
                    aria-label="Artifact"
                    onClick={() => {
                      onShowArtifact();
                      if (window.innerWidth < 768) onClose();
                    }}
                    className={toolBtnClass(isArtifactOpen)}
                  >
                    <FileCode2 size={15} strokeWidth={1.75} />
                  </button>
                ) : null}
              </div>
            )}

            {rail ? (
              <div className="space-y-0.5">
                <div className="flex justify-center py-1">
                  <UserMenu variant="sidebar" className="w-auto [&>button]:w-auto [&>button]:justify-center [&>button]:rounded-full [&>button]:p-1.5 [&_.min-w-0]:hidden [&_svg]:hidden" />
                </div>
                <button
                  type="button"
                  title="Settings"
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
                </button>
                <button
                  type="button"
                  title="VANI Pro"
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
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={bottomActionClass}
                  aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                  title="Theme"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-surface-hover text-text-secondary">
                    {mounted && theme === 'dark' ? (
                      <Sun size={14} strokeWidth={1.75} />
                    ) : (
                      <Moon size={14} strokeWidth={1.75} />
                    )}
                  </span>
                </button>
              </div>
            ) : (
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
            )}
          </div>
        </div>

        {/* Desktop resize handle — right edge; double-click resets to default */}
        {isDesktop && !rail ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuemin={70}
            aria-valuemax={360}
            aria-valuenow={expandedWidth}
            title="Drag to resize · Double-click to reset"
            className={cn(
              'absolute inset-y-4 right-0 z-20 hidden w-1.5 translate-x-1/2 cursor-col-resize md:block',
              'group/resize touch-none'
            )}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              onResizeStart(e.clientX);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              resetWidth();
            }}
          >
            <span
              className={cn(
                'pointer-events-none absolute inset-y-8 left-1/2 w-px -translate-x-1/2 rounded-full',
                'bg-border opacity-0 transition-opacity duration-150',
                'group-hover/resize:opacity-100 group-active/resize:opacity-100',
                isResizing && 'opacity-100 bg-accent'
              )}
            />
          </div>
        ) : null}
      </motion.aside>

      <SidebarSearchPanel
        open={searchOpen}
        onClose={closeSearch}
        chats={recentChats}
        projects={projects}
        onSelectChat={(id) => {
          onSelectChat?.(id);
          if (window.innerWidth < 768) onClose();
        }}
        onSelectProject={(id) => {
          onSelectProject?.(id);
          if (window.innerWidth < 768) onClose();
        }}
        onOpenMemory={onOpenMemory}
      />
    </>
  );
}

// Re-export as memo to skip re-renders when parent updates unrelated chat/voice state.
const SidebarMemo = memo(Sidebar);
export { SidebarMemo as default };
