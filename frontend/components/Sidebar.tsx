'use client';

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Search,
  BookOpen,
  Brain,
  Users,
  Settings,
  Plus,
  Sparkles,
  MoreHorizontal,
  FolderKanban,
  Pin,
  Archive,
  Copy,
  Trash2,
  Pencil,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatSummary, Project } from '@/lib/types';
import {
  getAttachmentKind,
  readFileAsBase64,
  resolveMimeType,
} from '@/lib/files';

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  recentChats?: ChatSummary[];
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
}

const NAV_ITEMS = [
  { icon: MessageSquare, label: 'Chat', active: true },
  { icon: Search, label: 'Search', active: false },
  { icon: BookOpen, label: 'Library', active: false },
  { icon: Users, label: 'Agents', active: false },
  { icon: Settings, label: 'Settings', active: false },
];

const STATIC_TODAY = [
  { id: '1', title: 'शिवरात्रि کب ہے 2026 میں?', active: true },
  { id: '2', title: 'Explain Quantum Computing' },
  { id: '3', title: 'Best practices for React' },
  { id: '4', title: 'How AI works?' },
  { id: '5', title: 'What is VANI AI?' },
];

const STATIC_YESTERDAY = [
  { id: '6', title: 'JavaScript Array Methods' },
  { id: '7', title: 'Difference between SQL an...' },
];

export default function Sidebar({
  isOpen,
  onClose,
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
}: SidebarProps) {
  const [projectQuery, setProjectQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const knowledgeInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);

  const handleNewChat = () => {
    onNewChat?.();
    if (window.innerWidth < 768) onClose();
  };

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

  const visibleProjects = projectQuery
    ? projects.filter((p) =>
        `${p.name} ${p.description || ''}`.toLowerCase().includes(projectQuery.toLowerCase())
      )
    : projects;

  const historyChats = activeProjectId
    ? projectChats
    : null;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm md:hidden"
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
            'rounded-[28px]',
            'bg-white/60 dark:bg-white/[0.032]',
            'backdrop-blur-2xl backdrop-saturate-[1.6]',
            'border border-black/[0.035] dark:border-white/[0.05]',
            'shadow-[0_1px_1px_rgba(0,0,0,0.01),0_4px_16px_rgba(0,0,0,0.025),0_24px_56px_rgba(0,0,0,0.035),inset_0_0.5px_0_rgba(255,255,255,0.75)]',
            'dark:shadow-[0_1px_1px_rgba(0,0,0,0.15),0_6px_20px_rgba(0,0,0,0.2),0_28px_64px_rgba(0,0,0,0.3),inset_0_0.5px_0_rgba(255,255,255,0.04)]',
            'md:h-[calc(100vh-32px)] md:w-[260px]',
            'rounded-none md:rounded-[28px]'
          )}
        >
          {/* Brand */}
          <div className="flex items-center px-4 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-[12px]',
                  'bg-gradient-to-br from-[#0A84FF] via-[#0071E3] to-[#5856D6] text-white',
                  'shadow-[0_2px_10px_rgba(0,122,255,0.26)] ring-1 ring-white/20'
                )}
              >
                <Sparkles size={14} strokeWidth={2} />
              </div>
              <span className="text-[14.5px] font-semibold tracking-[-0.02em] text-foreground">
                VANI AI
              </span>
            </div>
          </div>

          {/* New Chat */}
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={handleNewChat}
              className={cn(
                'hover-lift group flex w-full items-center justify-between rounded-full',
                'bg-black/[0.02] dark:bg-white/[0.04]',
                'border border-black/[0.035] dark:border-white/[0.045]',
                'px-4 py-2.5 text-[13px] font-medium tracking-[-0.016em] text-foreground',
                'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
                'hover:bg-primary hover:text-white hover:border-transparent',
                'hover:shadow-[0_4px_16px_rgba(0,113,227,0.2)]'
              )}
            >
              <span className="flex items-center gap-2.5">
                <Plus size={15} strokeWidth={2} />
                New Chat
              </span>
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  'bg-foreground/[0.05] text-muted-foreground',
                  'transition-colors duration-200',
                  'group-hover:bg-white/15 group-hover:text-white/90'
                )}
              >
                ⌘K
              </span>
            </button>
          </div>

          {/* Navigation */}
          <nav className="space-y-1 px-3">
            {NAV_ITEMS.map(({ icon: Icon, label, active }) => (
              <button
                key={label}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-[14px] px-3.5 py-2',
                  'text-[13px] font-medium tracking-[-0.014em]',
                  'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
                  active
                    ? 'bg-black/[0.03] dark:bg-white/[0.045] text-foreground'
                    : 'text-muted-foreground hover:bg-black/[0.025] dark:hover:bg-white/[0.035] hover:text-foreground'
                )}
              >
                <Icon size={15} strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </nav>

          {/* Projects + History */}
          <div className="custom-scrollbar mt-4 flex-1 space-y-5 overflow-y-auto px-3 py-1">
            <section>
              <div className="mb-2 flex items-center justify-between px-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/40">
                  Projects
                </div>
                <button
                  type="button"
                  onClick={() => setCreating((v) => !v)}
                  className="rounded-full p-1 text-muted-foreground/60 hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
                  aria-label="Create project"
                >
                  <Plus size={13} strokeWidth={2} />
                </button>
              </div>

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
                      'w-full rounded-[12px] bg-black/[0.025] dark:bg-white/[0.035]',
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
                      'min-w-0 flex-1 rounded-[12px] bg-black/[0.03] dark:bg-white/[0.045]',
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
                    'flex w-full items-center gap-2 rounded-[14px] px-3.5 py-2 text-left',
                    'text-[12.5px] tracking-[-0.014em]',
                    !activeProjectId
                      ? 'bg-primary/[0.055] font-medium text-primary'
                      : 'text-foreground/55 hover:bg-black/[0.025] dark:hover:bg-white/[0.035] hover:text-foreground'
                  )}
                >
                  <MessageSquare size={13} strokeWidth={1.75} />
                  <span className="truncate">Personal chats</span>
                </button>

                {(projectQuery ? visibleProjects : [...pinnedProjects, ...visibleProjects.filter((p) => !p.pinned)])
                  .filter((p, i, arr) => arr.findIndex((x) => x._id === p._id) === i)
                  .slice(0, 20)
                  .map((project) => (
                    <div key={project._id} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProject?.(project._id);
                          setMenuId(null);
                          if (window.innerWidth < 768) onClose();
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-[14px] px-3.5 py-2 text-left',
                          'text-[12.5px] tracking-[-0.014em]',
                          activeProjectId === project._id
                            ? 'bg-primary/[0.055] font-medium text-primary'
                            : 'text-foreground/55 hover:bg-black/[0.025] dark:hover:bg-white/[0.035] hover:text-foreground'
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
                            setMenuId((id) => (id === project._id ? null : project._id));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              setMenuId((id) => (id === project._id ? null : project._id));
                            }
                          }}
                          className="rounded-md p-0.5 opacity-50 hover:bg-black/[0.06] hover:opacity-100 dark:hover:bg-white/[0.08]"
                          aria-label="Project actions"
                        >
                          <MoreHorizontal size={13} />
                        </span>
                      </button>

                      {menuId === project._id && (
                        <div
                          className={cn(
                            'absolute right-2 top-9 z-20 w-[168px] overflow-hidden rounded-[14px]',
                            'border border-black/[0.06] bg-white/95 shadow-lg backdrop-blur-xl',
                            'dark:border-white/[0.08] dark:bg-[#1c1c1e]/95'
                          )}
                        >
                          {[
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
                              onClick: () => {
                                uploadTargetRef.current = project._id;
                                knowledgeInputRef.current?.click();
                              },
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
                          ].map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              onClick={async () => {
                                setMenuId(null);
                                await item.onClick();
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-foreground/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                            >
                              <item.icon size={13} strokeWidth={1.75} />
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between px-3.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/40">
                  {activeProjectId ? 'Project chats' : 'Today'}
                </div>
                {activeProjectId && (
                  <button
                    type="button"
                    onClick={() => onSelectProject?.(null)}
                    className="rounded-full p-0.5 text-muted-foreground/50 hover:text-foreground"
                    aria-label="Clear project filter"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {historyChats ? (
                  historyChats.length ? (
                    historyChats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => {
                          onSelectChat?.(chat.id);
                          if (window.innerWidth < 768) onClose();
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-[14px] px-3.5 py-2 text-left',
                          'text-[12.5px] tracking-[-0.014em]',
                          'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
                          activeChatId === chat.id
                            ? 'bg-primary/[0.055] font-medium text-primary'
                            : 'text-foreground/55 hover:bg-black/[0.025] dark:hover:bg-white/[0.035] hover:text-foreground'
                        )}
                      >
                        <span className="truncate">{chat.title}</span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3.5 py-2 text-[12px] text-muted-foreground/50">
                      No chats in this project yet.
                    </p>
                  )
                ) : (
                  STATIC_TODAY.map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between rounded-[14px] px-3.5 py-2 text-left',
                        'text-[12.5px] tracking-[-0.014em]',
                        'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
                        chat.active
                          ? 'bg-primary/[0.055] font-medium text-primary'
                          : 'text-foreground/55 hover:bg-black/[0.025] dark:hover:bg-white/[0.035] hover:text-foreground'
                      )}
                    >
                      <span className="truncate">{chat.title}</span>
                      {chat.active && (
                        <span className="ml-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </section>

            {!activeProjectId && (
              <section>
                <div className="mb-2 px-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/40">
                  Yesterday
                </div>
                <div className="space-y-0.5">
                  {STATIC_YESTERDAY.map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center rounded-[14px] px-3.5 py-2 text-left',
                        'text-[12.5px] tracking-[-0.014em] text-foreground/55',
                        'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
                        'hover:bg-black/[0.025] dark:hover:bg-white/[0.035] hover:text-foreground'
                      )}
                    >
                      <span className="truncate">{chat.title}</span>
                    </button>
                  ))}
                </div>
              </section>
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

          {/* Pro card */}
          <div className="px-3 pb-3 pt-2">
            <div
              className={cn(
                'rounded-[18px] p-4',
                'border border-primary/[0.06]',
                'bg-gradient-to-br from-[#0A84FF]/[0.05] via-[#5856D6]/[0.032] to-[#AF52DE]/[0.04]',
                'shadow-[0_2px_12px_rgba(0,0,0,0.02),inset_0_0.5px_0_rgba(255,255,255,0.4)]',
                'dark:shadow-[0_2px_16px_rgba(0,0,0,0.15),inset_0_0.5px_0_rgba(255,255,255,0.05)]'
              )}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-[9px] bg-primary text-white shadow-[0_2px_8px_rgba(0,113,227,0.3)]">
                  <Sparkles size={11} strokeWidth={2.5} />
                </div>
                <span className="text-[13px] font-semibold tracking-[-0.014em] text-foreground">
                  VANI Pro
                </span>
              </div>
              <p className="mb-3 text-[11.5px] leading-[1.55] text-muted-foreground">
                Unlimited messages, faster responses and more.
              </p>
              <button
                type="button"
                className={cn(
                  'hover-lift w-full rounded-full bg-foreground py-2',
                  'text-[12px] font-semibold tracking-[-0.014em] text-background',
                  'transition-[filter] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
                  'hover:brightness-110 active:brightness-95'
                )}
              >
                Upgrade Plan →
              </button>
            </div>
          </div>

          {/* Profile */}
          <div className="border-t border-black/[0.04] dark:border-white/[0.05] p-3">
            <div
              className={cn(
                'hover-lift flex cursor-default items-center justify-between rounded-[16px] p-2.5',
                'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
                'hover:bg-foreground/[0.035] dark:hover:bg-white/[0.045]'
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    'bg-gradient-to-tr from-[#007AFF] to-[#5856D6]',
                    'text-[10px] font-semibold text-white',
                    'shadow-[0_2px_10px_rgba(0,122,255,0.22)] ring-1 ring-white/15'
                  )}
                >
                  HG
                </div>
                <div className="min-w-0 overflow-hidden">
                  <div className="truncate text-[13px] font-medium tracking-[-0.014em] text-foreground">
                    Himanshu Gupta
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    himanshu@example.com
                  </div>
                </div>
              </div>
              <MoreHorizontal size={14} className="shrink-0 text-muted-foreground/45" />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
