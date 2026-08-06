'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Sparkles, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AUTO_MODEL_KEY,
  fetchModelsCatalog,
  type ModelOption,
} from '@/lib/models';
import { SPRING, DROPDOWN_MOTION } from '@/lib/motion';
import { Spinner } from '@/components/ui/Spinner';

type SectionId = 'google' | 'openai' | 'anthropic' | 'opensource';

const SECTIONS: { id: SectionId; title: string }[] = [
  { id: 'google', title: 'Google' },
  { id: 'openai', title: 'OpenAI' },
  { id: 'anthropic', title: 'Anthropic' },
  { id: 'opensource', title: 'Open Source' },
];

function sectionForModel(m: ModelOption): SectionId | null {
  const hay = `${m.key} ${m.id} ${m.displayName} ${m.provider}`.toLowerCase();
  if (m.provider === 'anthropic' || /\bclaude\b/.test(hay)) return 'anthropic';
  if (m.provider === 'openai' || /\bgpt\b/.test(hay)) return 'openai';
  if (m.provider === 'gemini' || /\bgemini\b/.test(hay)) return 'google';
  if (
    /\bdeepseek\b/.test(hay) ||
    /\bllama\b/.test(hay) ||
    /\bmistral\b/.test(hay) ||
    /\bqwen\b/.test(hay) ||
    m.provider === 'ollama' ||
    m.provider === 'groq'
  ) {
    return 'opensource';
  }
  if (m.provider === 'openrouter') {
    if (/\bclaude\b/.test(hay)) return 'anthropic';
    if (/\bgpt|openai\b/.test(hay)) return 'openai';
    if (/\bgemini\b/.test(hay)) return 'google';
    return 'opensource';
  }
  return null;
}

export interface ModelSelectorProps {
  value: string;
  onChange: (modelKey: string) => void;
  disabled?: boolean;
  projectDefault?: string | null;
}

export default function ModelSelector({
  value,
  onChange,
  disabled,
  projectDefault,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchModelsCatalog()
      .then((catalog) => {
        if (cancelled) return;
        setModels(catalog.models.filter((m) => m.enabled));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || 'Failed to load models');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected =
    value === AUTO_MODEL_KEY
      ? null
      : models.find((m) => m.key === value || m.id === value) || null;

  const label =
    value === AUTO_MODEL_KEY
      ? 'Auto'
      : selected?.displayName || 'Auto';

  const bySection = useMemo(() => {
    const map = new Map<SectionId, ModelOption[]>();
    for (const m of models) {
      const section = sectionForModel(m);
      if (!section) continue;
      const list = map.get(section) || [];
      list.push(m);
      map.set(section, list);
    }
    return map;
  }, [models]);

  const isAuto = value === AUTO_MODEL_KEY;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5',
          'text-sm font-medium tracking-[-0.01em]',
          'transition-all duration-normal ease-apple',
          'text-text-secondary hover:bg-surface-hover hover:text-foreground',
          open && 'bg-surface-hover text-foreground',
          'disabled:opacity-50'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select model"
        data-testid="model-selector"
      >
        <Sparkles size={13} strokeWidth={1.75} className="opacity-60" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={SPRING.snappy}
            className="max-w-[9rem] truncate"
          >
            {label}
          </motion.span>
        </AnimatePresence>
        <ChevronDown
          size={13}
          strokeWidth={1.75}
          className={cn(
            'opacity-50 transition-transform duration-normal ease-spring',
            open && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            {...DROPDOWN_MOTION}
            className={cn(
              'absolute bottom-full right-0 z-50 mb-2',
              'w-[min(300px,calc(100vw-2rem))] overflow-hidden',
              'rounded-[20px] menu-surface shadow-3'
            )}
          >
            <div className="border-b border-divider px-4 py-3">
              <p className="text-sm font-semibold tracking-[-0.02em] text-foreground">
                Models
              </p>
              <p className="mt-0.5 text-micro font-medium text-text-tertiary">
                Choose a provider and model
              </p>
            </div>

            <div className="max-h-[min(420px,55vh)] overflow-y-auto py-2">
              {loadError ? (
                <div className="px-4 py-3">
                  <p className="mb-2 text-caption text-danger">{loadError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setLoadError(null);
                      fetchModelsCatalog()
                        .then((catalog) =>
                          setModels(catalog.models.filter((m) => m.enabled))
                        )
                        .catch((err) =>
                          setLoadError(err?.message || 'Failed to load models')
                        );
                    }}
                    className="text-caption font-semibold text-accent hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : models.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-8 text-caption text-text-tertiary">
                  <Spinner size={14} />
                  Loading models…
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isAuto}
                    onClick={() => {
                      onChange(AUTO_MODEL_KEY);
                      setOpen(false);
                    }}
                    className={cn(
                      'mx-2 mb-1 flex w-[calc(100%-1rem)] items-center gap-3 rounded-[14px] px-3 py-2.5 text-left',
                      'transition-colors duration-150',
                      isAuto
                        ? 'bg-accent-muted'
                        : 'hover:bg-surface-hover'
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-muted text-accent">
                      <Zap size={14} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold tracking-[-0.015em] text-foreground">
                        Auto
                      </span>
                      <span className="mt-0.5 block text-micro font-medium text-text-tertiary">
                        Best model for the task
                      </span>
                    </span>
                    {isAuto ? (
                      <Check size={15} className="shrink-0 text-accent" />
                    ) : null}
                  </button>

                  {SECTIONS.map((section) => {
                    const list = bySection.get(section.id) || [];
                    if (list.length === 0) return null;

                    return (
                      <div key={section.id} className="mt-2 first:mt-0">
                        <div className="px-4 pb-1.5 pt-2.5">
                          <p className="text-caption font-semibold tracking-[-0.01em] text-foreground">
                            {section.title}
                          </p>
                        </div>
                        <div className="space-y-0.5 px-2 pb-1">
                          {list.map((m) => {
                            const active =
                              value === m.key || value === m.id;
                            const isProjectDefault =
                              !!projectDefault &&
                              (m.key === projectDefault ||
                                m.id === projectDefault);

                            return (
                              <button
                                key={m.key}
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  onChange(m.key);
                                  setOpen(false);
                                }}
                                className={cn(
                                  'flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left',
                                  'transition-colors duration-150',
                                  active
                                    ? 'bg-accent-muted'
                                    : 'hover:bg-surface-hover'
                                )}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-1.5">
                                    <span className="truncate text-sm font-medium tracking-[-0.014em] text-foreground">
                                      {m.displayName}
                                    </span>
                                    {isProjectDefault ? (
                                      <span className="rounded-md bg-surface-hover px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wide text-text-tertiary">
                                        Project
                                      </span>
                                    ) : null}
                                  </span>
                                  {m.capabilities?.length ? (
                                    <span className="mt-0.5 block truncate text-micro font-medium text-text-tertiary">
                                      {m.capabilities.slice(0, 3).join(' · ')}
                                    </span>
                                  ) : null}
                                </span>
                                {active ? (
                                  <Check
                                    size={15}
                                    className="shrink-0 text-accent"
                                  />
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
