'use client';

import { useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import {
  CANVAS_AI_ACTIONS,
  type CanvasAiAction,
  type CanvasType } from '@/lib/canvas/types';

interface CanvasAiMenuProps {
  type: CanvasType;
  hasSelection: boolean;
  busy?: boolean;
  onAction: (
    action: CanvasAiAction,
    opts?: { wholeDocument?: boolean; instruction?: string; targetLanguage?: string }
  ) => void;
}

export default function CanvasAiMenu({ type, hasSelection, busy, onAction }: CanvasAiMenuProps) {
  const [open, setOpen] = useState(false);
  const [translateLang, setTranslateLang] = useState('Spanish');
  const [custom, setCustom] = useState('');

  const isCode =
    type === 'code' || type === 'html' || type === 'react' || type === 'json' || type === 'csv';

  const actions = CANVAS_AI_ACTIONS.filter((a) => !a.codeOnly || isCode);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium transition-colors',
          'bg-primary/12 text-primary hover:bg-primary/18 disabled:opacity-50'
        )}
      >
        {busy ? <Spinner size={13} /> : <Sparkles size={13} />}
        Ask AI
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 top-9 z-40 w-64 overflow-hidden rounded-2xl border p-2',
            'border-[var(--glass-border)] bg-[var(--glass-strong)] shadow-[var(--glass-shadow-lg)] backdrop-blur-xl'
          )}
        >
          <p className="px-2 pb-1.5 pt-1 text-micro text-muted-foreground">
            {hasSelection
              ? 'Edits apply to the selection only'
              : 'No selection — choose whole document'}
          </p>
          <div className="max-h-64 custom-scrollbar overflow-y-auto">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-surface-hover"
                onClick={() => {
                  if (action.id === 'translate') {
                    onAction('translate', {
                      wholeDocument: !hasSelection,
                      targetLanguage: translateLang });
                  } else {
                    onAction(action.id, { wholeDocument: !hasSelection });
                  }
                  setOpen(false);
                }}
              >
                <Wand2 size={13} className="text-primary/80" />
                {action.label}
              </button>
            ))}
          </div>

          <div className="mt-1 space-y-1.5 border-t border-black/[0.06] px-2 pb-1 pt-2 dark:border-white/[0.06]">
            <input
              value={translateLang}
              onChange={(e) => setTranslateLang(e.target.value)}
              placeholder="Translate language"
              className="h-7 w-full rounded-lg border border-black/10 bg-transparent px-2 text-caption dark:border-white/10"
 />
            <div className="flex gap-1">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Custom instruction…"
                className="h-7 min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-2 text-caption dark:border-white/10"
 />
              <button
                type="button"
                disabled={!custom.trim()}
                onClick={() => {
                  onAction('custom', {
                    wholeDocument: !hasSelection,
                    instruction: custom.trim() });
                  setOpen(false);
                  setCustom('');
                }}
                className="rounded-lg bg-primary px-2 text-micro font-medium text-white disabled:opacity-40"
              >
                Run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
