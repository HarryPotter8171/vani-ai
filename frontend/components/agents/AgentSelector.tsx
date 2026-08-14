'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  Code2,
  Feather,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, SPRING } from '@/lib/motion';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import type { AgentTypeId, AgentTypeInfo } from '@/lib/agents';

const PRIMARY_IDS: AgentTypeId[] = [
  'general',
  'coding',
  'research',
  'writing',
  'data_analysis',
  'web',
];

const SHORT_NAMES: Partial<Record<AgentTypeId, string>> = {
  general: 'General',
  coding: 'Coding',
  research: 'Research',
  writing: 'Writing',
  data_analysis: 'Data',
  web: 'Web',
};

const CATEGORIES: {
  id: string;
  label: string;
  agents: AgentTypeId[];
}[] = [
  { id: 'core', label: 'General', agents: ['general'] },
  { id: 'build', label: 'Coding', agents: ['coding'] },
  { id: 'discover', label: 'Research', agents: ['research'] },
  { id: 'create', label: 'Writing', agents: ['writing'] },
  { id: 'analyze', label: 'Data', agents: ['data_analysis'] },
  { id: 'web', label: 'Web', agents: ['web'] },
  { id: 'creative', label: 'Creative', agents: [] },
];

const AGENT_META: Partial<
  Record<AgentTypeId, { icon: LucideIcon; blurb: string; category: string }>
> = {
  general: {
    icon: Sparkles,
    blurb: 'Everyday chat and reasoning',
    category: 'General',
  },
  coding: {
    icon: Code2,
    blurb: 'Write, debug, and review code',
    category: 'Coding',
  },
  research: {
    icon: Search,
    blurb: 'Investigate topics with depth',
    category: 'Research',
  },
  writing: {
    icon: Feather,
    blurb: 'Drafts, edits, and tone polish',
    category: 'Writing',
  },
  data_analysis: {
    icon: BarChart3,
    blurb: 'Tables, charts, and insights',
    category: 'Data',
  },
  web: {
    icon: Search,
    blurb: 'Live web and browser automation',
    category: 'Web',
  },
};

const DROPDOWN_TRANSITION = { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as const };

export interface AgentSelectorProps {
  agents: AgentTypeInfo[];
  selectedAgent: AgentTypeId | null;
  onSelect: (id: AgentTypeId | null) => void;
  disabled?: boolean;
}

function AgentList({
  primary,
  selectedAgent,
  onPick,
  dense,
}: {
  primary: AgentTypeInfo[];
  selectedAgent: AgentTypeId | null;
  onPick: (id: AgentTypeId | null) => void;
  dense?: boolean;
}) {
  return (
    <>
      {CATEGORIES.map((cat) => {
        const catAgents = primary.filter((a) =>
          cat.agents.length ? cat.agents.includes(a.id) : false
        );
        if (!catAgents.length && cat.id !== 'creative') return null;

        return (
          <div key={cat.id} className={cn('px-1.5 py-1', !dense && 'px-2')}>
            <div className="px-3 pb-1 pt-1.5 text-micro font-semibold uppercase tracking-[0.07em] text-text-tertiary">
              {cat.label}
            </div>
            {cat.id === 'creative' ? (
              <PremiumEmpty
                size="sm"
                icon={Sparkles}
                title="Creative agents coming soon"
                className="mx-1.5 mb-1 rounded-[12px] border border-dashed border-border py-4"
              />
            ) : (
              catAgents.map((agent) => {
                const meta = AGENT_META[agent.id];
                const Icon = meta?.icon || Bot;
                const name = SHORT_NAMES[agent.id] || agent.name;
                const active =
                  agent.id === 'general'
                    ? selectedAgent === null || selectedAgent === 'general'
                    : selectedAgent === agent.id;

                return (
                  <button
                    key={agent.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => onPick(agent.id === 'general' ? null : agent.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[14px] px-3 text-left',
                      'transition-colors duration-fast ease-apple touch-manipulation',
                      dense ? 'min-h-[52px] py-2.5' : 'min-h-[56px] py-3',
                      active ? 'bg-accent-muted' : 'hover:bg-surface-hover active:bg-surface-hover'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]',
                        active
                          ? 'bg-accent/20 text-accent'
                          : 'bg-surface-hover text-text-secondary'
                      )}
                    >
                      <Icon size={17} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold tracking-[-0.016em] text-foreground">
                        {name}
                      </span>
                      <span className="mt-0.5 block text-caption leading-snug text-text-secondary">
                        {meta?.blurb || agent.description}
                      </span>
                    </span>
                    {active && <Check size={16} className="shrink-0 text-accent" />}
                  </button>
                );
              })
            )}
          </div>
        );
      })}
    </>
  );
}

export default function AgentSelector({
  agents,
  selectedAgent,
  onSelect,
  disabled,
}: AgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();

  const primary = useMemo(() => {
    const list = agents.filter((a) => PRIMARY_IDS.includes(a.id));
    list.sort((a, b) => PRIMARY_IDS.indexOf(a.id) - PRIMARY_IDS.indexOf(b.id));
    if (!list.some((a) => a.id === 'general')) {
      list.unshift({
        id: 'general',
        name: 'General',
        description: 'Standard chat',
        tools: [],
      });
    }
    return list;
  }, [agents]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    if (!isDesktop) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, isDesktop]);

  useEffect(() => {
    if (!open || !isDesktop) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open, isDesktop]);

  const displayName =
    selectedAgent && SHORT_NAMES[selectedAgent]
      ? SHORT_NAMES[selectedAgent]!
      : selectedAgent
        ? agents.find((a) => a.id === selectedAgent)?.name || 'General'
        : 'General';

  const pick = (id: AgentTypeId | null) => {
    onSelect(id);
    setOpen(false);
  };

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setOpen((v) => !v)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3',
        'h-11 max-md:min-w-[44px] max-md:justify-center max-md:gap-0 max-md:px-0 max-md:w-11 md:h-8 md:px-2.5',
        'text-sm font-medium tracking-[-0.01em] touch-manipulation',
        'transition-all duration-normal ease-apple',
        'text-text-secondary hover:bg-surface-hover hover:text-foreground',
        open && 'bg-surface-hover text-foreground',
        'disabled:opacity-50'
      )}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label="Select agent"
      data-testid="agent-selector"
    >
      <Bot size={14} strokeWidth={1.75} className="opacity-60" />
      <span className="max-w-[6.5rem] truncate max-md:hidden">{displayName}</span>
      <ChevronDown
        size={13}
        strokeWidth={1.75}
        className={cn(
          'opacity-50 transition-transform duration-normal ease-out max-md:hidden',
          open && 'rotate-180'
        )}
      />
    </button>
  );

  const header = (
    <div className="border-b border-divider px-4 py-3">
      <p className="text-micro font-semibold uppercase tracking-[0.06em] text-text-tertiary">
        Agents
      </p>
      <p className="mt-0.5 text-caption text-text-secondary">
        Specialized modes for how VANI thinks
      </p>
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      {trigger}

      {/* Desktop: anchored dropdown (chat stays visible) */}
      {isDesktop ? (
        <AnimatePresence>
          {open && (
            <motion.div
              role="listbox"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={DROPDOWN_TRANSITION}
              className={cn(
                'absolute bottom-full right-0 z-50 mb-2 w-[min(300px,calc(100vw-2rem))] overflow-hidden',
                'rounded-[20px] menu-surface shadow-3'
              )}
            >
              {header}
              <div className="max-h-[min(420px,55vh)] overflow-y-auto py-1.5">
                <AgentList
                  primary={primary}
                  selectedAgent={selectedAgent}
                  onPick={pick}
                  dense
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      ) : null}

      {/* Mobile: bottom sheet — chat remains visible behind scrim */}
      {mounted && !isDesktop
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <div className="fixed inset-0 z-[280]" role="presentation">
                  <motion.button
                    type="button"
                    aria-label="Dismiss"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: EASE.apple }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                    onClick={() => setOpen(false)}
                  />
                  <motion.div
                    role="listbox"
                    aria-label="Select agent"
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={SPRING.snappy}
                    className={cn(
                      'absolute inset-x-0 bottom-0 flex flex-col',
                      'max-h-[min(78dvh,640px)]',
                      'rounded-t-[22px] border border-border/70 border-b-0',
                      'bg-surface-elevated shadow-[0_-8px_40px_rgba(0,0,0,0.28)]',
                      'pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]'
                    )}
                  >
                    <div className="flex shrink-0 justify-center pt-3 pb-1" aria-hidden>
                      <span className="h-1 w-9 rounded-full bg-foreground/15" />
                    </div>
                    <div className="shrink-0">{header}</div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1.5">
                      <AgentList
                        primary={primary}
                        selectedAgent={selectedAgent}
                        onPick={pick}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className={cn(
                        'mx-3 mt-1 mb-1 flex h-12 w-[calc(100%-1.5rem)] items-center justify-center',
                        'rounded-full bg-surface-hover text-body font-semibold tracking-[-0.016em]',
                        'text-foreground active:scale-[0.985] transition-transform touch-manipulation'
                      )}
                    >
                      Cancel
                    </button>
                  </motion.div>
                </div>
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : null}
    </div>
  );
}
