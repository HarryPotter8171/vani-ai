'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Search,
  BookOpen,
  Users,
  Settings,
  Plus,
  Sparkles,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatSummary } from '@/lib/types';

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  recentChats?: ChatSummary[];
  onNewChat?: () => void;
}

const NAV_ITEMS = [
  { icon: MessageSquare, label: 'Chat', active: true },
  { icon: Search, label: 'Search', active: false },
  { icon: BookOpen, label: 'Library', active: false },
  { icon: Users, label: 'Agents', active: false },
  { icon: Settings, label: 'Settings', active: false },
];

const STATIC_TODAY = [
  { id: '1', title: 'शिवरात्रि کب है 2026 में?', active: true },
  { id: '2', title: 'Explain Quantum Computing' },
  { id: '3', title: 'Best practices for React' },
  { id: '4', title: 'How AI works?' },
  { id: '5', title: 'What is VANI AI?' },
];

const STATIC_YESTERDAY = [
  { id: '6', title: 'JavaScript Array Methods' },
  { id: '7', title: 'Difference between SQL an...' },
];

export default function Sidebar({ isOpen, onClose, onNewChat }: SidebarProps) {
  const handleNewChat = () => {
    onNewChat?.();
    if (window.innerWidth < 768) onClose();
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[6px] md:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          'fixed z-50 flex flex-col transition-transform duration-500 ease-apple',
          'inset-y-0 left-0 w-[288px] md:w-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          'md:relative md:shrink-0 md:py-4 md:pl-4 md:pr-0'
        )}
      >
        <div
          className={cn(
            'flex h-full flex-col overflow-hidden',
            'glass-panel-elevated',
            'md:h-[calc(100vh-32px)] md:w-[268px]'
          )}
        >
          {/* Brand */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#007AFF] to-[#5856D6] text-white shadow-[0_4px_16px_rgba(0,122,255,0.25)]">
                <Sparkles size={16} strokeWidth={2} />
              </div>
              <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
                VANI AI
              </span>
            </div>
            <div className="flex items-center gap-[7px]">
              <div className="h-[11px] w-[11px] rounded-full bg-[#FF5F56]/90" />
              <div className="h-[11px] w-[11px] rounded-full bg-[#FFBD2E]/90" />
              <div className="h-[11px] w-[11px] rounded-full bg-[#27C93F]/90" />
            </div>
          </div>

          {/* New Chat */}
          <div className="px-3.5 pb-2">
            <button
              type="button"
              onClick={handleNewChat}
              className={cn(
                'hover-lift group flex w-full items-center justify-between rounded-[16px]',
                'bg-foreground/[0.03] dark:bg-white/[0.05]',
                'px-4 py-3 text-[13.5px] font-medium tracking-[-0.01em] text-foreground',
                'transition-all duration-300 ease-apple',
                'hover:bg-primary hover:text-white hover:shadow-[0_4px_20px_var(--primary-glow)]'
              )}
            >
              <span className="flex items-center gap-2.5">
                <Plus size={16} strokeWidth={2} />
                New Chat
              </span>
              <span
                className={cn(
                  'rounded-[8px] px-2 py-0.5 text-[10.5px] font-semibold',
                  'bg-foreground/[0.05] text-muted-foreground',
                  'group-hover:bg-white/15 group-hover:text-white/90'
                )}
              >
                ⌘K
              </span>
            </button>
          </div>

          {/* Navigation */}
          <nav className="space-y-0.5 px-3">
            {NAV_ITEMS.map(({ icon: Icon, label, active }) => (
              <button
                key={label}
                type="button"
                className={cn(
                  'hover-lift flex w-full items-center gap-3 rounded-[14px] px-3.5 py-2.5',
                  'text-[13.5px] font-medium tracking-[-0.01em] transition-all duration-300',
                  active
                    ? 'bg-foreground/[0.05] dark:bg-white/[0.07] text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/[0.03] dark:hover:bg-white/[0.04] hover:text-foreground'
                )}
              >
                <Icon size={16} strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </nav>

          {/* History */}
          <div className="custom-scrollbar mt-3 flex-1 space-y-5 overflow-y-auto px-3 py-2">
            <section>
              <div className="mb-2 px-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">
                Today
              </div>
              <div className="space-y-0.5">
                {STATIC_TODAY.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    className={cn(
                      'hover-lift flex w-full items-center justify-between rounded-[14px] px-3.5 py-2.5 text-left text-[13px] tracking-[-0.01em] transition-all duration-300',
                      chat.active
                        ? 'bg-primary/[0.08] font-medium text-primary'
                        : 'text-foreground/70 hover:bg-foreground/[0.03] dark:hover:bg-white/[0.04] hover:text-foreground'
                    )}
                  >
                    <span className="truncate">{chat.title}</span>
                    {chat.active && (
                      <span className="ml-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-2 px-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">
                Yesterday
              </div>
              <div className="space-y-0.5">
                {STATIC_YESTERDAY.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    className="hover-lift flex w-full items-center rounded-[14px] px-3.5 py-2.5 text-left text-[13px] tracking-[-0.01em] text-foreground/70 transition-all duration-300 hover:bg-foreground/[0.03] dark:hover:bg-white/[0.04] hover:text-foreground"
                  >
                    <span className="truncate">{chat.title}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Pro card */}
          <div className="p-3">
            <div
              className={cn(
                'rounded-[20px] border border-primary/10 p-4',
                'bg-gradient-to-br from-blue-500/[0.06] via-indigo-500/[0.04] to-purple-500/[0.06]',
                'shadow-glass'
              )}
            >
              <div className="mb-2 flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[#007AFF] text-white shadow-[0_2px_10px_rgba(0,122,255,0.3)]">
                  <Sparkles size={13} strokeWidth={2.5} />
                </div>
                <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">
                  VANI Pro
                </span>
              </div>
              <p className="mb-3.5 text-[12px] leading-[1.6] text-muted-foreground">
                Unlimited messages, faster responses and more.
              </p>
              <button
                type="button"
                className={cn(
                  'hover-lift w-full rounded-[14px] bg-foreground py-2.5',
                  'text-[12.5px] font-semibold tracking-[-0.01em] text-background',
                  'shadow-glass transition-all duration-300'
                )}
              >
                Upgrade Plan →
              </button>
            </div>
          </div>

          {/* Profile */}
          <div className="border-t border-border/50 p-3">
            <div className="hover-lift flex cursor-default items-center justify-between rounded-[16px] p-2.5 transition-all duration-300 hover:bg-foreground/[0.03] dark:hover:bg-white/[0.04]">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-[11px] font-semibold text-white shadow-[0_2px_12px_rgba(0,122,255,0.25)] ring-1 ring-white/10">
                  HG
                </div>
                <div className="min-w-0 overflow-hidden">
                  <div className="truncate text-[13.5px] font-medium tracking-[-0.01em] text-foreground">
                    Himanshu Gupta
                  </div>
                  <div className="truncate text-[11.5px] text-muted-foreground">
                    himanshu@example.com
                  </div>
                </div>
              </div>
              <MoreHorizontal size={15} className="shrink-0 text-muted-foreground/50" />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
