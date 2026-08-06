'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Brain,
  FileText,
  FolderKanban,
  MessageSquare,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, SPRING } from '@/lib/motion';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { filterChatsByQuery } from '@/lib/chatSearch';
import { apiFetch } from '@/lib/apiClient';
import {
  fetchMemories,
  fetchMemorySettings,
  type MemoryItem,
} from '@/lib/memory';
import type { ChatSummary, Project, ProjectFile } from '@/lib/types';

export interface SidebarSearchPanelProps {
  open: boolean;
  onClose: () => void;
  chats: ChatSummary[];
  projects: Project[];
  onSelectChat?: (chatId: string) => void;
  onSelectProject?: (projectId: string | null) => void;
  onOpenMemory?: () => void;
}

interface FileHit {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
}

function matchesQuery(hay: string, query: string): boolean {
  return hay.toLowerCase().includes(query.toLowerCase());
}

function ResultSection({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  if (empty) return null;
  return (
    <section className="mb-4 last:mb-0">
      <h3 className="mb-1.5 px-2 text-micro font-semibold uppercase tracking-[0.06em] text-text-tertiary">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function ResultRow({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Search;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-left',
        'transition-colors duration-150',
        'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-hover text-text-secondary">
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium tracking-[-0.014em] text-foreground">
          {label}
        </span>
        {hint ? (
          <span className="block truncate text-micro text-text-tertiary">{hint}</span>
        ) : null}
      </span>
    </button>
  );
}

export default function SidebarSearchPanel({
  open,
  onClose,
  chats,
  projects,
  onSelectChat,
  onSelectProject,
  onOpenMemory,
}: SidebarSearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<FileHit[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [loadingExtras, setLoadingExtras] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingExtras(true);

    (async () => {
      try {
        const [settings, memoryResult, fileGroups] = await Promise.all([
          fetchMemorySettings().catch(() => null),
          fetchMemories({ limit: 40, sort: 'updatedAt' }).catch(() => null),
          Promise.all(
            projects.slice(0, 20).map(async (project) => {
              try {
                const res = await apiFetch(`/projects/${project._id}/files`);
                if (!res.ok) return [] as FileHit[];
                const list = (await res.json()) as ProjectFile[];
                return list.map((f) => ({
                  id: f._id,
                  name: f.name,
                  projectId: project._id,
                  projectName: project.name,
                }));
              } catch {
                return [] as FileHit[];
              }
            })
          ),
        ]);

        if (cancelled) return;
        setMemoryEnabled(settings?.enabled !== false && !!settings);
        setMemories(memoryResult?.memories ?? []);
        setFiles(fileGroups.flat());
      } finally {
        if (!cancelled) setLoadingExtras(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, projects]);

  const q = query.trim();

  const matchedChats = useMemo(
    () => (q ? filterChatsByQuery(chats, q) : chats).slice(0, 8),
    [chats, q]
  );

  const matchedProjects = useMemo(() => {
    const list = q
      ? projects.filter((p) => matchesQuery(p.name, q) || matchesQuery(p.description || '', q))
      : projects;
    return list.slice(0, 6);
  }, [projects, q]);

  const matchedFiles = useMemo(() => {
    if (!files.length) return [];
    const list = q ? files.filter((f) => matchesQuery(f.name, q)) : files;
    return list.slice(0, 6);
  }, [files, q]);

  const matchedMemories = useMemo(() => {
    if (!memoryEnabled || !memories.length) return [];
    const list = q
      ? memories.filter(
          (m) =>
            matchesQuery(m.content, q) ||
            matchesQuery(m.key || '', q) ||
            matchesQuery(m.category, q)
        )
      : memories;
    return list.slice(0, 6);
  }, [memories, memoryEnabled, q]);

  const recentChats = useMemo(() => chats.slice(0, 5), [chats]);

  const hasAnyResults =
    matchedChats.length > 0 ||
    matchedProjects.length > 0 ||
    matchedFiles.length > 0 ||
    matchedMemories.length > 0 ||
    (!q && recentChats.length > 0);

  const pickChat = (id: string) => {
    onSelectChat?.(id);
    onClose();
  };

  const pickProject = (id: string) => {
    onSelectProject?.(id);
    onClose();
  };

  const pickMemory = () => {
    onOpenMemory?.();
    onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[160]">
          <motion.button
            type="button"
            aria-label="Close search"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE.apple }}
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <div className="pointer-events-none absolute inset-0 flex items-start justify-center px-4 pt-[12vh] sm:pt-[14vh]">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Search"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={SPRING.soft}
              className={cn(
                'pointer-events-auto flex w-full max-w-[520px] flex-col overflow-hidden',
                'max-h-[min(560px,70vh)] rounded-[20px]',
                'border border-white/20 dark:border-white/[0.1]',
                'bg-white/80 dark:bg-[#1c1c1e]/88',
                'backdrop-blur-[40px] backdrop-saturate-[180%]',
                'shadow-[0_24px_80px_rgba(0,0,0,0.28)] dark:shadow-[0_28px_90px_rgba(0,0,0,0.55)]'
              )}
            >
              <div className="flex items-center gap-3 border-b border-divider px-4 py-3.5">
                <Search size={16} strokeWidth={1.75} className="shrink-0 text-text-tertiary" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search conversations..."
                  aria-label="Search conversations"
                  className={cn(
                    'min-w-0 flex-1 bg-transparent text-body tracking-[-0.016em]',
                    'text-foreground placeholder:text-text-tertiary focus-ring-token'
                  )}
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-hover hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>

              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
                {!q && recentChats.length > 0 ? (
                  <ResultSection title="Recent">
                    {recentChats.map((chat) => (
                      <ResultRow
                        key={`recent-${chat.id}`}
                        icon={MessageSquare}
                        label={chat.title || 'Untitled'}
                        hint={chat.lastMessage}
                        onClick={() => pickChat(chat.id)}
                      />
                    ))}
                  </ResultSection>
                ) : null}

                {q ? (
                  <>
                    <ResultSection title="Chats" empty={matchedChats.length === 0}>
                      {matchedChats.map((chat) => (
                        <ResultRow
                          key={chat.id}
                          icon={MessageSquare}
                          label={chat.title || 'Untitled'}
                          hint={chat.lastMessage}
                          onClick={() => pickChat(chat.id)}
                        />
                      ))}
                    </ResultSection>

                    {projects.length > 0 ? (
                      <ResultSection title="Projects" empty={matchedProjects.length === 0}>
                        {matchedProjects.map((project) => (
                          <ResultRow
                            key={project._id}
                            icon={FolderKanban}
                            label={project.name}
                            hint={project.description}
                            onClick={() => pickProject(project._id)}
                          />
                        ))}
                      </ResultSection>
                    ) : null}

                    {files.length > 0 ? (
                      <ResultSection title="Files" empty={matchedFiles.length === 0}>
                        {matchedFiles.map((file) => (
                          <ResultRow
                            key={`${file.projectId}-${file.id}`}
                            icon={FileText}
                            label={file.name}
                            hint={file.projectName}
                            onClick={() => pickProject(file.projectId)}
                          />
                        ))}
                      </ResultSection>
                    ) : null}

                    {memoryEnabled ? (
                      <ResultSection title="Memories" empty={matchedMemories.length === 0}>
                        {matchedMemories.map((memory) => (
                          <ResultRow
                            key={memory.id}
                            icon={Brain}
                            label={memory.content}
                            hint={memory.key || memory.category}
                            onClick={pickMemory}
                          />
                        ))}
                      </ResultSection>
                    ) : null}

                    {!hasAnyResults && !loadingExtras ? (
                      <PremiumEmpty
                        size="sm"
                        icon={Search}
                        title="No results"
                        description={`Nothing matches “${q}”.`}
                        className="py-10"
                      />
                    ) : null}
                  </>
                ) : (
                  <>
                    {projects.length > 0 ? (
                      <ResultSection title="Projects">
                        {matchedProjects.slice(0, 4).map((project) => (
                          <ResultRow
                            key={project._id}
                            icon={FolderKanban}
                            label={project.name}
                            hint={project.description}
                            onClick={() => pickProject(project._id)}
                          />
                        ))}
                      </ResultSection>
                    ) : null}

                    {files.length > 0 ? (
                      <ResultSection title="Files">
                        {matchedFiles.slice(0, 4).map((file) => (
                          <ResultRow
                            key={`${file.projectId}-${file.id}`}
                            icon={FileText}
                            label={file.name}
                            hint={file.projectName}
                            onClick={() => pickProject(file.projectId)}
                          />
                        ))}
                      </ResultSection>
                    ) : null}

                    {memoryEnabled && matchedMemories.length > 0 ? (
                      <ResultSection title="Memories">
                        {matchedMemories.slice(0, 4).map((memory) => (
                          <ResultRow
                            key={memory.id}
                            icon={Brain}
                            label={memory.content}
                            hint={memory.key || memory.category}
                            onClick={pickMemory}
                          />
                        ))}
                      </ResultSection>
                    ) : null}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
