'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING, OVERLAY_FADE } from '@/lib/motion';
import { Kbd } from '@/components/ui/Kbd';

export interface ShortcutDef {
  id: string;
  keys: string[];
  label: string;
  group: string;
}

const DEFAULT_SHORTCUTS: ShortcutDef[] = [
  { id: 'palette', keys: ['⌘', 'K'], label: 'Command palette / search', group: 'General' },
  { id: 'new-chat', keys: ['⌘', '⇧', 'O'], label: 'New chat', group: 'General' },
  { id: 'shortcuts', keys: ['⌘', '/'], label: 'Keyboard shortcuts', group: 'General' },
  { id: 'send', keys: ['↵'], label: 'Send message', group: 'Chat' },
  { id: 'newline', keys: ['⇧', '↵'], label: 'New line in composer', group: 'Chat' },
  { id: 'stop', keys: ['Esc'], label: 'Stop generation / close overlay', group: 'Chat' },
  { id: 'voice', keys: ['⌘', '⇧', 'V'], label: 'Voice mode', group: 'Features' },
  { id: 'zoom-in', keys: ['+', '='], label: 'Zoom image in viewer', group: 'Media' },
  { id: 'zoom-out', keys: ['-'], label: 'Zoom out', group: 'Media' },
  { id: 'zoom-reset', keys: ['0'], label: 'Reset zoom', group: 'Media' },
];

interface ShortcutsContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  shortcuts: ShortcutDef[];
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

export function useKeyboardShortcuts() {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) throw new Error('useKeyboardShortcuts must be used within KeyboardShortcutsProvider');
  return ctx;
}

export function useKeyboardShortcutsOptional() {
  return useContext(ShortcutsContext);
}

export function KeyboardShortcutsProvider({
  children,
  shortcuts = DEFAULT_SHORTCUTS,
  onVoice,
  onNewChat,
}: {
  children: React.ReactNode;
  shortcuts?: ShortcutDef[];
  onVoice?: () => void;
  onNewChat?: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === '/') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        onVoice?.();
        return;
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        onNewChat?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onVoice, onNewChat]);

  const value = useMemo(() => ({ open, setOpen, shortcuts }), [open, shortcuts]);

  return (
    <ShortcutsContext.Provider value={value}>
      {children}
      <ShortcutsSheet open={open} onClose={() => setOpen(false)} shortcuts={shortcuts} />
    </ShortcutsContext.Provider>
  );
}

function ShortcutsSheet({
  open,
  onClose,
  shortcuts,
}: {
  open: boolean;
  onClose: () => void;
  shortcuts: ShortcutDef[];
}) {
  const groups = useMemo(() => {
    const map = new Map<string, ShortcutDef[]>();
    for (const s of shortcuts) {
      const list = map.get(s.group) || [];
      list.push(s);
      map.set(s.group, list);
    }
    return Array.from(map.entries());
  }, [shortcuts]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[260] flex items-center justify-center px-4">
          <motion.div {...OVERLAY_FADE} className="absolute inset-0 bg-overlay/60 backdrop-blur-md" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Keyboard shortcuts"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={SPRING.soft}
            className={cn(
              'relative z-10 w-full max-w-[440px] overflow-hidden rounded-[22px]',
              'border border-border bg-surface-elevated shadow-3'
            )}
          >
            <div className="flex items-center justify-between border-b border-divider px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent-muted text-accent">
                  <Keyboard size={15} strokeWidth={2} />
                </span>
                <h2 className="text-body font-semibold tracking-[-0.02em]">Keyboard shortcuts</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
            <div className="custom-scrollbar max-h-[min(60vh,480px)] overflow-y-auto px-5 py-4">
              {groups.map(([group, items]) => (
                <div key={group} className="mb-5 last:mb-0">
                  <p className="os-section-label mb-2.5">{group}</p>
                  <ul className="space-y-1">
                    {items.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-4 rounded-[12px] px-2 py-2 hover:bg-surface-hover"
                      >
                        <span className="text-sm tracking-[-0.014em] text-foreground">
                          {s.label}
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          {s.keys.map((k) => (
                            <Kbd key={`${s.id}-${k}`}>{k}</Kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
