'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MessageSquarePlus,
  Search,
  Settings,
  CreditCard,
  Brain,
  Mic,
  Sparkles,
  LayoutDashboard,
  MessageSquare,
  Keyboard,
  Globe2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING, OVERLAY_FADE } from '@/lib/motion';
import { Kbd } from '@/components/ui/Kbd';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { filterChatsByQuery } from '@/lib/chatSearch';
import type { ChatSummary } from '@/lib/types';

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  shortcut?: string;
  group?: string;
  keywords?: string[];
  onSelect: () => void;
}

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  }
  return ctx;
}

/** Safe optional access when provider may be absent (tests / share page). */
export function useCommandPaletteOptional(): CommandPaletteContextValue | null {
  return useContext(CommandPaletteContext);
}

export interface CommandPaletteProviderProps {
  children: React.ReactNode;
  actions?: CommandAction[];
  chats?: ChatSummary[];
  onSelectChat?: (id: string) => void;
  onNewChat?: () => void;
}

function scoreMatch(hay: string, query: string): boolean {
  return hay.toLowerCase().includes(query.toLowerCase());
}

export function CommandPaletteProvider({
  children,
  actions = [],
  chats = [],
  onSelectChat,
  onNewChat,
}: CommandPaletteProviderProps) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);

  // Global ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== 'k') return;
      // Ignore when typing in editable that isn't our palette (palette handles its own)
      e.preventDefault();
      e.stopPropagation();
      setOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteDialog
        open={open}
        onClose={() => setOpen(false)}
        actions={actions}
        chats={chats}
        onSelectChat={onSelectChat}
        onNewChat={onNewChat}
 />
    </CommandPaletteContext.Provider>
  );
}

function CommandPaletteDialog({
  open,
  onClose,
  actions,
  chats,
  onSelectChat,
  onNewChat,
}: {
  open: boolean;
  onClose: () => void;
  actions: CommandAction[];
  chats: ChatSummary[];
  onSelectChat?: (id: string) => void;
  onNewChat?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  const defaultActions: CommandAction[] = useMemo(() => {
    const base: CommandAction[] = [
      {
        id: 'new-chat',
        label: 'New chat',
        hint: 'Start a fresh conversation',
        icon: MessageSquarePlus,
        shortcut: '⇧⌘O',
        group: 'Actions',
        keywords: ['new', 'chat', 'conversation'],
        onSelect: () => onNewChat?.(),
      },
    ];
    return [...base, ...actions];
  }, [actions, onNewChat]);

  const filteredActions = useMemo(() => {
    const q = query.trim();
    if (!q) return defaultActions;
    return defaultActions.filter(
      (a) =>
        scoreMatch(a.label, q) ||
        (a.hint && scoreMatch(a.hint, q)) ||
        a.keywords?.some((k) => scoreMatch(k, q))
    );
  }, [defaultActions, query]);

  const filteredChats = useMemo(
    () => (query.trim() ? filterChatsByQuery(chats, query).slice(0, 8) : chats.slice(0, 6)),
    [chats, query]
  );

  type Row =
    | { kind: 'header'; id: string; label: string }
    | { kind: 'action'; id: string; action: CommandAction }
    | { kind: 'chat'; id: string; chat: ChatSummary };

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (filteredActions.length) {
      out.push({ kind: 'header', id: 'hdr-actions', label: 'Actions' });
      for (const a of filteredActions) {
        out.push({ kind: 'action', id: `action-${a.id}`, action: a });
      }
    }
    if (filteredChats.length && onSelectChat) {
      out.push({ kind: 'header', id: 'hdr-chats', label: 'Conversations' });
      for (const c of filteredChats) {
        out.push({ kind: 'chat', id: `chat-${c.id}`, chat: c });
      }
    }
    return out;
  }, [filteredActions, filteredChats, onSelectChat]);

  const selectable = rows.filter((r) => r.kind !== 'header');

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const runRow = useCallback(
    (row: Row) => {
      if (row.kind === 'action') {
        row.action.onSelect();
        onClose();
      } else if (row.kind === 'chat') {
        onSelectChat?.(row.chat.id);
        onClose();
      }
    },
    [onClose, onSelectChat]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(selectable.length - 1, i + 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = selectable[activeIndex];
      if (row) runRow(row);
    }
  };

  let selectIdx = -1;

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[250] flex items-start justify-center px-4 pt-[min(18vh,140px)]">
          <motion.div
            {...OVERLAY_FADE}
            className="absolute inset-0 bg-overlay/70 backdrop-blur-[10px]"
            onClick={onClose}
            aria-hidden
 />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={SPRING.snappy}
            onKeyDown={onKeyDown}
            className={cn(
              'relative z-10 flex w-full max-w-[560px] flex-col overflow-hidden',
              'rounded-[22px] border border-border',
              'bg-surface-elevated/95 shadow-3',
              'backdrop-blur-[28px] backdrop-saturate-[1.6]'
            )}
          >
            <div className="flex items-center gap-3 border-b border-divider px-4 py-3.5">
              <Search size={16} strokeWidth={2} className="shrink-0 text-text-tertiary" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations & actions…"
                aria-label="Global search"
                className={cn(
                  'min-w-0 flex-1 bg-transparent text-body tracking-[-0.016em]',
                  'text-foreground placeholder:text-text-tertiary focus-ring-token'
                )}
 />
              <Kbd>esc</Kbd>
            </div>

            <div
              ref={listRef}
              className="custom-scrollbar max-h-[min(52vh,420px)] overflow-y-auto p-2"
            >
              {selectable.length === 0 ? (
                <PremiumEmpty
                  size="sm"
                  icon={Search}
                  title="No results"
                  description="Try a different search or start a new chat."
                  className="py-10"
                />
              ) : (
                rows.map((row) => {
                  if (row.kind === 'header') {
                    return (
                      <p
                        key={row.id}
                        className="os-section-label px-2.5 pb-1 pt-2.5 first:pt-1"
                      >
                        {row.label}
                      </p>
                    );
                  }
                  selectIdx += 1;
                  const idx = selectIdx;
                  const active = idx === activeIndex;
                  if (row.kind === 'action') {
                    const Icon = row.action.icon || Sparkles;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        data-active={active}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => runRow(row)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2.5',
                          'text-left transition-colors duration-fast',
                          active ? 'bg-accent-muted' : 'hover:bg-surface-hover'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]',
                            active
                              ? 'bg-accent text-text-on-accent'
                              : 'bg-surface-hover text-text-secondary'
                          )}
                        >
                          <Icon size={15} strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block truncate text-sm font-medium tracking-[-0.014em]',
                              active ? 'text-accent' : 'text-foreground'
                            )}
                          >
                            {row.action.label}
                          </span>
                          {row.action.hint ? (
                            <span className="block truncate text-micro text-text-tertiary">
                              {row.action.hint}
                            </span>
                          ) : null}
                        </span>
                        {row.action.shortcut ? (
                          <span className="text-micro font-semibold text-text-tertiary">
                            {row.action.shortcut}
                          </span>
                        ) : null}
                      </button>
                    );
                  }
                  return (
                    <button
                      key={row.id}
                      type="button"
                      data-active={active}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => runRow(row)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2.5',
                        'text-left transition-colors duration-fast',
                        active ? 'bg-accent-muted' : 'hover:bg-surface-hover'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]',
                          active
                            ? 'bg-accent text-text-on-accent'
                            : 'bg-surface-hover text-text-secondary'
                        )}
                      >
                        <MessageSquare size={15} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-sm font-medium tracking-[-0.014em]',
                            active ? 'text-accent' : 'text-foreground'
                          )}
                        >
                          {row.chat.title || 'Untitled'}
                        </span>
                        {row.chat.lastMessage ? (
                          <span className="block truncate text-micro text-text-tertiary">
                            {row.chat.lastMessage}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t border-divider px-3.5 py-2.5">
              <div className="flex items-center gap-3 text-micro text-text-tertiary">
                <span className="inline-flex items-center gap-1">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  navigate
                </span>
                <span className="inline-flex items-center gap-1">
                  <Kbd>↵</Kbd>
                  open
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-micro text-text-tertiary">
                <Keyboard size={12} strokeWidth={2} />
                Command palette
              </span>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/** Helpers to build common action entries from the app shell. */
export const COMMAND_ICONS = {
  Settings,
  CreditCard,
  Brain,
  Mic,
  LayoutDashboard,
  MessageSquarePlus,
  Search,
  Sparkles,
  Globe2,
} as const;
