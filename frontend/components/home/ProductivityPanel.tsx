'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Pin,
  Brain,
  Lightbulb,
  StickyNote,
  CloudSun,
  Activity,
  Target,
  Sparkles,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { EASE, SPRING } from '@/lib/motion';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import type { ChatSummary, Project } from '@/lib/types';
import type { MemoryItem } from '@/lib/memory';

export interface ProductivityPanelProps {
  activeProject?: Project | null;
  recentChats?: ChatSummary[];
  recentProjects?: Project[];
  memories?: MemoryItem[];
  onSelectProject?: (projectId: string) => void;
  onSelectChat?: (chatId: string) => void;
  onOpenMemory?: () => void;
  onSuggestionClick?: (text: string) => void;
  className?: string;
}

const AI_TIPS = [
  'Pin a project to keep context across chats.',
  'Ask VANI to remember preferences — they show up here.',
  'Use Voice for brainstorming when typing feels slow.',
  'Drop a PDF and ask for a structured brief.',
  'Open Canvas when drafting long-form content.',
];

const NOTES_KEY = 'vani-quick-notes';

export default function ProductivityPanel({
  activeProject = null,
  recentChats = [],
  recentProjects = [],
  memories = [],
  onSelectProject,
  onSelectChat,
  onOpenMemory,
  onSuggestionClick,
  className,
}: ProductivityPanelProps) {
  const [note, setNote] = useState('');
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NOTES_KEY);
      if (saved) setNote(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % AI_TIPS.length);
    }, 12000);
    return () => window.clearInterval(id);
  }, []);

  const pinned =
    recentProjects.find((p) => p.pinned) || activeProject || recentProjects[0] || null;
  const focusChat = recentChats.find(
    (c) => c.title && !/^new chat$/i.test(c.title.trim())
  );
  const recentMemory = memories[0];
  const activity = [
    ...recentChats.slice(0, 3).map((c) => ({
      id: `c-${c.id}`,
      label: c.title || 'Chat',
      time: c.updatedAt,
      kind: 'chat' as const,
      onClick: () => onSelectChat?.(c.id),
    })),
    ...recentProjects.slice(0, 2).map((p) => ({
      id: `p-${p._id}`,
      label: p.name,
      time: p.lastOpenedAt || p.updatedAt,
      kind: 'project' as const,
      onClick: () => onSelectProject?.(p._id),
    })),
  ]
    .sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : 0;
      const tb = b.time ? new Date(b.time).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 4);

  const hour = new Date().getHours();
  const weatherLabel =
    hour < 12 ? 'Clear morning' : hour < 18 ? 'Mild afternoon' : 'Calm evening';

  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: EASE.smooth, delay: 0.18 }}
      className={cn(
        'productivity-panel hidden w-[280px] shrink-0 flex-col gap-3 p-3.5 xl:flex',
        'sticky top-6 max-h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar',
        className
      )}
      aria-label="Productivity"
    >
      <div className="mb-0.5 flex items-center gap-2 px-1">
        <Sparkles size={12} className="text-accent" strokeWidth={2} />
        <span className="os-section-label px-0">Today</span>
      </div>

      {/* Today's Focus */}
      <div className="productivity-widget">
        <div className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          <Target size={11} strokeWidth={2} />
          Today&apos;s Focus
        </div>
        {focusChat ? (
          <button
            type="button"
            onClick={() => onSelectChat?.(focusChat.id)}
            className="w-full text-left"
          >
            <p className="truncate text-sm font-semibold tracking-[-0.016em] text-foreground">
              {focusChat.title}
            </p>
            <p className="mt-0.5 text-micro text-text-secondary">
              Continue where you left off
            </p>
          </button>
        ) : (
          <p className="text-sm text-text-secondary">
            Start a chat to set today&apos;s focus.
          </p>
        )}
      </div>

      {/* Pinned Project */}
      <div className="productivity-widget">
        <div className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          <Pin size={11} strokeWidth={2} />
          Pinned Project
        </div>
        {pinned ? (
          <button
            type="button"
            onClick={() => onSelectProject?.(pinned._id)}
            className="w-full text-left"
          >
            <p className="truncate text-sm font-semibold tracking-[-0.016em] text-foreground">
              {pinned.name}
            </p>
            <p className="mt-0.5 line-clamp-2 text-micro text-text-secondary">
              {pinned.description ||
                `${pinned.stats?.fileCount ?? 0} files · ${pinned.stats?.chatCount ?? 0} chats`}
            </p>
          </button>
        ) : (
          <p className="text-sm text-text-secondary">Pin a project to surface it here.</p>
        )}
      </div>

      {/* Recent Memory */}
      <div className="productivity-widget">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            <Brain size={11} strokeWidth={2} />
            Recent Memory
          </div>
          {onOpenMemory ? (
            <button
              type="button"
              onClick={onOpenMemory}
              className="text-micro font-medium text-accent hover:underline"
            >
              All
            </button>
          ) : null}
        </div>
        {recentMemory ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-foreground/90">
            {recentMemory.content}
          </p>
        ) : (
          <p className="text-sm text-text-secondary">
            Memories you save will appear here.
          </p>
        )}
      </div>

      {/* AI Tips */}
      <div className="productivity-widget">
        <div className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          <Lightbulb size={11} strokeWidth={2} />
          AI Tips
        </div>
        <motion.p
          key={tipIndex}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING.soft}
          className="text-sm leading-relaxed text-text-secondary"
        >
          {AI_TIPS[tipIndex]}
        </motion.p>
        {onSuggestionClick ? (
          <button
            type="button"
            onClick={() =>
              onSuggestionClick?.(
                'Give me one practical tip to work faster with VANI today.'
              )
            }
            className="mt-2 text-micro font-medium text-accent hover:underline"
          >
            Ask for another
          </button>
        ) : null}
      </div>

      {/* Quick Notes */}
      <div className="productivity-widget">
        <div className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          <StickyNote size={11} strokeWidth={2} />
          Quick Notes
        </div>
        <textarea
          value={note}
          onChange={(e) => {
            const v = e.target.value;
            setNote(v);
            try {
              localStorage.setItem(NOTES_KEY, v);
            } catch {
              /* ignore */
            }
          }}
          placeholder="Scratch thoughts…"
          rows={3}
          className={cn(
            'w-full resize-none rounded-[10px] bg-transparent',
            'text-sm leading-relaxed text-foreground',
            'placeholder:text-text-tertiary/70'
          )}
        />
      </div>

      {/* Weather placeholder */}
      <div className="productivity-widget">
        <div className="mb-1.5 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          <CloudSun size={11} strokeWidth={2} />
          Weather
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-[-0.04em] text-foreground">
            —
          </span>
          <span className="text-caption text-text-secondary">{weatherLabel}</span>
        </div>
        <p className="mt-1 text-micro text-text-tertiary">Location coming soon</p>
      </div>

      {/* Recent Activity */}
      <div className="productivity-widget">
        <div className="mb-2 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          <Activity size={11} strokeWidth={2} />
          Recent Activity
        </div>
        {activity.length ? (
          <ul className="space-y-1.5">
            {activity.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={item.onClick}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-caption font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="shrink-0 text-micro tabular-nums text-text-tertiary">
                    {formatRelativeTime(item.time)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <PremiumEmpty
            size="sm"
            icon={Activity}
            title="No recent activity yet"
            description="Chats, projects, and memories will show up here."
            className="px-0 py-4"
          />
        )}
      </div>
    </motion.aside>
  );
}
