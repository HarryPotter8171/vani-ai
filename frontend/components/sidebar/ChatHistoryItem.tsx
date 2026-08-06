'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Star,
  Trash2,
  MessageSquare,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import HighlightText from '@/components/ui/HighlightText';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { DROPDOWN_MOTION } from '@/lib/motion';
import type { ChatSummary } from '@/lib/types';

export interface ChatHistoryItemProps {
  chat: ChatSummary;
  isActive: boolean;
  /** Active search query — matching substrings in the title are highlighted. */
  query?: string;
  onSelect: (chatId: string) => void;
  onRename?: (chatId: string, newTitle: string) => void;
  onDelete?: (chatId: string) => void;
  onPin?: (chatId: string, pinned: boolean) => void;
}

function chatInitial(title: string): string {
  const t = title.trim();
  if (!t) return '?';
  return t.charAt(0).toUpperCase();
}

function ChatHistoryItem({
  chat,
  isActive,
  query = '',
  onSelect,
  onRename,
  onDelete,
  onPin,
}: ChatHistoryItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(chat.title);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useOnClickOutside(containerRef, () => setMenuOpen(false), menuOpen);

  useEffect(() => {
    if (!isEditing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [isEditing]);

  const startEditing = useCallback(() => {
    setEditValue(chat.title);
    setIsEditing(true);
  }, [chat.title]);

  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    setIsEditing(false);
    if (!trimmed || trimmed === chat.title) return;
    onRename?.(chat.id, trimmed);
  }, [editValue, chat.title, chat.id, onRename]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(chat.title);
  }, [chat.title]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit]
  );

  const menuItems = [
    {
      label: chat.pinned ? 'Unpin' : 'Pin',
      icon: chat.pinned ? PinOff : Pin,
      onClick: () => onPin?.(chat.id, !chat.pinned),
    },
    {
      label: chat.pinned ? 'Remove favorite' : 'Favorite',
      icon: Star,
      onClick: () => onPin?.(chat.id, !chat.pinned),
    },
    { label: 'Rename', icon: Pencil, onClick: startEditing },
    { label: 'Delete', icon: Trash2, onClick: () => onDelete?.(chat.id), danger: true },
  ];

  const contextItems: ContextMenuItem[] = [
    {
      id: 'pin',
      label: chat.pinned ? 'Unpin' : 'Pin',
      icon: chat.pinned ? <PinOff size={13} /> : <Pin size={13} />,
      onSelect: () => onPin?.(chat.id, !chat.pinned),
    },
    {
      id: 'favorite',
      label: chat.pinned ? 'Unfavorite' : 'Favorite',
      icon: <Star size={13} className={chat.pinned ? 'fill-current' : undefined} />,
      onSelect: () => onPin?.(chat.id, !chat.pinned),
    },
    {
      id: 'rename',
      label: 'Rename',
      icon: <Pencil size={13} />,
      onSelect: startEditing,
    },
    { id: 'sep', label: '', separator: true },
    {
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 size={13} />,
      danger: true,
      onSelect: () => onDelete?.(chat.id),
    },
  ];

  if (isEditing) {
    return (
      <div ref={containerRef} className="group/item relative">
        <div
          className={cn(
            'flex w-full items-center gap-2 rounded-[14px] py-2 pl-3.5 pr-1.5',
            'bg-primary/[0.055] ring-1 ring-primary/20'
          )}
        >
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={cancelEdit}
            onClick={(e) => e.stopPropagation()}
            maxLength={100}
            aria-label="Rename conversation"
            className={cn(
              'min-w-0 flex-1 truncate bg-transparent text-sm tracking-[-0.014em]',
              'text-foreground placeholder:text-muted-foreground/40 focus-ring-token'
            )}
          />
        </div>
      </div>
    );
  }

  return (
    <ContextMenu items={contextItems}>
      <div ref={containerRef} className="group/item relative">
        <button
          type="button"
          onClick={() => onSelect(chat.id)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-[14px] py-2 pl-2.5 pr-1.5 text-left',
            'text-sm tracking-[-0.014em]',
            'transition-all duration-fast ease-apple',
            isActive
              ? 'bg-accent-muted font-medium text-accent shadow-1'
              : 'text-text-secondary hover:bg-surface-hover hover:text-foreground'
          )}
        >
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-micro font-semibold',
              isActive
                ? 'bg-accent text-text-on-accent'
                : 'bg-surface-hover text-text-tertiary group-hover/item:text-accent'
            )}
            aria-hidden
          >
            {chat.title ? chatInitial(chat.title) : <MessageSquare size={12} />}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate">
              <HighlightText text={chat.title} query={query} />
            </span>
            {chat.updatedAt ? (
              <span className="mt-0.5 block text-micro font-medium tabular-nums text-text-tertiary opacity-80">
                {formatRelativeTime(chat.updatedAt)}
              </span>
            ) : null}
          </span>

          <span className="flex shrink-0 items-center gap-0.5">
            {chat.pinned && (
              <Star
                size={11}
                className="fill-accent text-accent opacity-80"
                aria-label="Favorite"
              />
            )}

            {/* Hover quick actions */}
            <span
              role="button"
              tabIndex={0}
              title={chat.pinned ? 'Unpin' : 'Pin'}
              onClick={(e) => {
                e.stopPropagation();
                onPin?.(chat.id, !chat.pinned);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onPin?.(chat.id, !chat.pinned);
                }
              }}
              className={cn(
                'rounded-md p-1 opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100',
                'hover:bg-surface-hover text-text-tertiary hover:text-accent',
                chat.pinned && 'opacity-60'
              )}
              aria-label={chat.pinned ? 'Unpin conversation' : 'Pin conversation'}
            >
              {chat.pinned ? <PinOff size={12} /> : <Pin size={12} />}
            </span>

            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }
              }}
              className={cn(
                'rounded-md p-1 opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100',
                'hover:bg-surface-hover',
                menuOpen && 'opacity-100 bg-surface-hover'
              )}
              aria-label="Conversation actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal size={13} />
            </span>
          </span>
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              role="menu"
              {...DROPDOWN_MOTION}
              className={cn(
                'absolute right-1 top-10 z-20 w-[168px] overflow-hidden rounded-[16px] p-1',
                'menu-surface shadow-token-lg'
              )}
            >
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    item.onClick();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm font-medium tracking-[-0.014em]',
                    'transition-colors duration-fast ease-apple',
                    item.danger
                      ? 'text-danger hover:bg-danger-muted'
                      : 'text-foreground hover:bg-surface-hover'
                  )}
                >
                  <item.icon size={13} strokeWidth={1.75} />
                  {item.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ContextMenu>
  );
}

export default memo(ChatHistoryItem);
