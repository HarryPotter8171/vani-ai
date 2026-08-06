'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Brain,
  Download,
  Pencil,
  Plus,
  Trash2,
  X,
  Sparkles,
  Pin,
  Clock,
  Hourglass,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select, SearchInput } from '@/components/ui/Input';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { ErrorState } from '@/components/ui/ErrorState';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useMemory } from '@/hooks/useMemory';
import { useMemoryPrefs } from '@/hooks/useMemoryPrefs';
import {
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS,
  type MemoryCategory,
  type MemoryItem,
} from '@/lib/memory';

export interface MemoryManagerProps {
  open: boolean;
  onClose: () => void;
  /** Active chat id — enables summarize against /memory/summarize. */
  chatId?: string | null;
}

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

type MemoryView = 'categories' | 'timeline' | 'pinned' | 'temporary' | 'auto';

function importanceLabel(n: number) {
  if (n >= 0.8) return 'High';
  if (n >= 0.5) return 'Medium';
  return 'Low';
}

function formatDate(value?: string) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function timelineBucket(value?: string): string {
  if (!value) return 'Earlier';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (d >= startOfToday) return 'Today';
  if (d >= startOfYesterday) return 'Yesterday';
  const weekAgo = new Date(startOfToday);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (d >= weekAgo) return 'This week';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function timelineOrder(label: string): number {
  if (label === 'Today') return 0;
  if (label === 'Yesterday') return 1;
  if (label === 'This week') return 2;
  if (label === 'Earlier') return 99;
  return 50;
}

function MemoryEditor({
  initial,
  onCancel,
  onSave,
  saving,
  categories = MEMORY_CATEGORIES,
}: {
  initial?: Partial<MemoryItem>;
  onCancel: () => void;
  onSave: (data: { content: string; category: MemoryCategory; key?: string }) => Promise<void>;
  saving: boolean;
  categories?: readonly MemoryCategory[];
}) {
  const [content, setContent] = useState(initial?.content || '');
  const [category, setCategory] = useState<MemoryCategory>(
    (initial?.category as MemoryCategory) || 'fact'
  );
  const [key, setKey] = useState(initial?.key || '');
  const categoryOptions = categories.length ? categories : MEMORY_CATEGORIES;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2, ease: EASE }}
      className={cn(
        'rounded-[18px] p-4',
        'bg-black/[0.03] dark:bg-white/[0.04]',
        'border border-border'
      )}
    >
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What should VANI remember?"
        rows={3}
        className={cn(
          'rounded-[14px] border-0 bg-transparent px-1 py-1',
          'text-sm leading-relaxed',
          'placeholder:text-muted-foreground/45'
        )}
        autoFocus
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as MemoryCategory)}
        >
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {MEMORY_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Optional key"
          className={cn(
            'min-w-[120px] flex-1 rounded-full px-3 py-1.5',
            'text-caption text-foreground/80 placeholder:text-muted-foreground/40'
          )}
        />
        <div className="ml-auto flex gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="px-3 text-caption"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={saving || !content.trim()}
            onClick={() =>
              void onSave({
                content: content.trim(),
                category,
                key: key.trim() || undefined,
              })
            }
            className="px-3.5 shadow-none hover:shadow-none disabled:opacity-40"
          >
            Save
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export default function MemoryManager({ open, onClose, chatId = null }: MemoryManagerProps) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const memory = useMemory({ enabled: open, chatId });
  const prefs = useMemoryPrefs();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<'memories' | 'profile'>('memories');
  const [view, setView] = useState<MemoryView>('categories');
  const [profileOverride, setProfileOverride] = useState<{
    preferredName: string;
    preferredLanguage: string;
    timezone: string;
    profession: string;
    interests: string;
    responseStyle: string;
    codingStyle: string;
    favoriteModel: string;
    uiPreferences: string;
  } | null>(null);

  const categoryOptions = memory.categories?.length
    ? memory.categories
    : [...MEMORY_CATEGORIES];

  const profileDraft = profileOverride ?? {
    preferredName: memory.settings?.profile.preferredName || '',
    preferredLanguage: memory.settings?.profile.preferredLanguage || '',
    timezone: memory.settings?.profile.timezone || '',
    profession: memory.settings?.profile.profession || '',
    interests: (memory.settings?.profile.interests || []).join(', '),
    responseStyle: memory.settings?.preferences.responseStyle || '',
    codingStyle: memory.settings?.preferences.codingStyle || '',
    favoriteModel: memory.settings?.preferences.favoriteModel || '',
    uiPreferences: memory.settings?.preferences.uiPreferences || '',
  };

  const patchProfile = (patch: Partial<typeof profileDraft>) => {
    setProfileOverride({ ...profileDraft, ...patch });
  };

  useEffect(() => {
    if (!open) {
      setProfileOverride(null);
      setEditingId(null);
      setCreating(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const pinnedIds = prefs.prefs.pinnedIds;
  const temporaryMap = prefs.prefs.temporary;

  const isServerTemporary = (m: MemoryItem) => {
    if (m.scope !== 'temporary') return false;
    if (!m.expiresAt) return true;
    const t = Date.parse(m.expiresAt);
    return !Number.isNaN(t) && t > Date.now();
  };

  const isItemPinned = (m: MemoryItem) =>
    m.scope === 'pinned' || pinnedIds.includes(m.id);

  const isItemTemporary = (m: MemoryItem) => {
    const exp = temporaryMap[m.id];
    const localTemp =
      !!exp && !Number.isNaN(Date.parse(exp)) && Date.parse(exp) > Date.now();
    return isServerTemporary(m) || localTemp;
  };

  const togglePin = async (item: MemoryItem) => {
    const currentlyPinned = isItemPinned(item);
    try {
      await memory.setMemoryScope(item.id, currentlyPinned ? 'long_term' : 'pinned');
      if (currentlyPinned && pinnedIds.includes(item.id)) prefs.togglePin(item.id);
      if (!currentlyPinned && !pinnedIds.includes(item.id)) prefs.togglePin(item.id);
      showToast(currentlyPinned ? 'Unpinned' : 'Pinned', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update pin', 'error');
    }
  };

  const toggleTemporary = async (item: MemoryItem) => {
    const currentlyTemp = isItemTemporary(item);
    try {
      await memory.setMemoryScope(item.id, currentlyTemp ? 'long_term' : 'temporary');
      if (currentlyTemp) prefs.clearTemporary(item.id);
      else prefs.markTemporary(item.id, 7);
      showToast(
        currentlyTemp ? 'Removed temporary flag' : 'Marked temporary (7 days)',
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Unable to update temporary flag',
        'error'
      );
    }
  };

  const filteredMemories = useMemo(() => {
    let list = memory.memories;
    if (view === 'pinned') {
      list = list.filter((m) => isItemPinned(m));
    } else if (view === 'temporary') {
      list = list.filter((m) => isItemTemporary(m));
    } else if (view === 'auto') {
      list = list.filter((m) => m.source === 'auto' || m.source === 'summary');
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helpers close over latest prefs/memory
  }, [memory.memories, view, pinnedIds, temporaryMap]);

  const grouped = useMemo(() => {
    const map = new Map<MemoryCategory | 'other', MemoryItem[]>();
    for (const m of filteredMemories) {
      const cat = MEMORY_CATEGORIES.includes(m.category) ? m.category : 'fact';
      const list = map.get(cat) || [];
      list.push(m);
      map.set(cat, list);
    }
    return map;
  }, [filteredMemories]);

  const timelineGroups = useMemo(() => {
    const map = new Map<string, MemoryItem[]>();
    const sorted = [...filteredMemories].sort((a, b) => {
      const ta = Date.parse(a.updatedAt || a.createdAt || '') || 0;
      const tb = Date.parse(b.updatedAt || b.createdAt || '') || 0;
      return tb - ta;
    });
    for (const m of sorted) {
      const bucket = timelineBucket(m.updatedAt || m.createdAt);
      const list = map.get(bucket) || [];
      list.push(m);
      map.set(bucket, list);
    }
    return Array.from(map.entries()).sort(
      (a, b) => timelineOrder(a[0]) - timelineOrder(b[0])
    );
  }, [filteredMemories]);

  const renderMemoryCard = (item: MemoryItem) => (
    <MemoryCard
      key={item.id}
      item={item}
      editing={editingId === item.id}
      saving={memory.isSaving}
      categories={categoryOptions}
      pinned={isItemPinned(item)}
      temporary={isItemTemporary(item)}
      onEdit={() => {
        setEditingId(item.id);
        setCreating(false);
      }}
      onCancelEdit={() => setEditingId(null)}
      onSave={async (data) => {
        try {
          await memory.editMemory(item.id, data);
          setEditingId(null);
          showToast('Memory updated', 'success');
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Unable to update memory', 'error');
        }
      }}
      onDelete={async () => {
        const ok = await confirm({
          title: 'Delete this memory?',
          description: 'VANI will no longer use this fact.',
          confirmLabel: 'Delete',
          variant: 'danger',
        });
        if (!ok) return;
        try {
          await memory.removeMemory(item.id);
          prefs.forgetIds([item.id]);
          showToast('Memory deleted', 'success');
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Unable to delete memory', 'error');
        }
      }}
      onTogglePin={() => {
        void togglePin(item);
      }}
      onToggleTemporary={() => {
        void toggleTemporary(item);
      }}
    />
  );

  const enabled = memory.settings?.enabled !== false;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 modal-overlay"
        onClick={onClose}
        aria-hidden="true"
 />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-manager-title"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: EASE }}
        className={cn(
          'relative flex h-[min(88vh,820px)] w-full max-w-[720px] flex-col overflow-hidden',
          'rounded-t-[28px] sm:rounded-[28px]',
          'bg-surface',
          'backdrop-blur-2xl backdrop-saturate-[1.6]',
          'border border-border',
          'shadow-[0_24px_80px_rgba(0,0,0,0.28)] dark:shadow-[0_28px_90px_rgba(0,0,0,0.65)]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
            {/* Atmosphere */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-20 -top-24 h-56 w-56 rounded-full bg-accent/12 blur-3xl" />
              <div className="absolute -right-16 top-32 h-48 w-48 rounded-full bg-[#5e5ce6]/10 blur-3xl" />
            </div>

            {/* Header */}
            <div className="relative flex items-start justify-between gap-4 border-b border-black/[0.05] px-5 pb-4 pt-5 dark:border-white/[0.06] sm:px-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-b from-accent to-accent-hover text-text-on-accent shadow-[0_4px_16px_var(--accent-glow)]">
                  <Brain size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <h2
                    id="memory-manager-title"
                    className="text-title font-semibold tracking-[-0.025em] text-foreground"
                  >
                    Memory
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground/70">
                    Timeline, categories, pins & temporary facts
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close memory"
                className="rounded-full p-2 text-muted-foreground/60 hover:bg-surface-hover hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            {/* Toggle + tabs */}
            <div className="relative space-y-3 border-b border-black/[0.05] px-5 py-4 dark:border-white/[0.06] sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium tracking-[-0.014em] text-foreground">
                    Reference saved memories
                  </div>
                  <div className="text-caption text-muted-foreground/65">
                    When on, VANI uses these facts to personalize replies
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={memory.isSaving}
                  onClick={() => {
                    void memory.setEnabled(!enabled).then(() => {
                      showToast(
                        !enabled ? 'Memory turned on' : 'Memory turned off',
                        'success'
                      );
                    });
                  }}
                  className={cn(
                    'relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors duration-200',
                    enabled ? 'bg-primary' : 'bg-black/15 dark:bg-white/20'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200',
                      enabled ? 'translate-x-[23px]' : 'translate-x-[3px]'
                    )}
 />
                </button>
              </div>

              <div className="flex gap-1 rounded-full bg-black/[0.035] p-1 dark:bg-white/[0.05]">
                {(
                  [
                    ['memories', 'Memories'],
                    ['profile', 'Profile'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      'flex-1 rounded-full py-1.5 text-sm font-medium transition-colors',
                      tab === id
                        ? 'bg-white text-foreground shadow-sm dark:bg-white/[0.12]'
                        : 'text-muted-foreground/70 hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="relative flex min-h-0 flex-1 flex-col">
              {tab === 'memories' ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 px-5 py-3 sm:px-6">
                    <SearchInput
                      value={memory.query}
                      onChange={(e) => memory.setQuery(e.target.value)}
                      placeholder="Search or recall by key"
                    />
                    <Select
                      value={memory.category}
                      onChange={(e) =>
                        memory.setCategory(e.target.value as MemoryCategory | 'all')
                      }
                      className="px-3 py-2"
                    >
                      <option value="all">All categories</option>
                      {categoryOptions.map((c) => (
                        <option key={c} value={c}>
                          {MEMORY_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </Select>
                    {chatId ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={memory.isSaving}
                        onClick={() => {
                          void memory
                            .summarizeActiveChat()
                            .then((result) => {
                              showToast(
                                result.summary
                                  ? 'Chat summarized into memory'
                                  : 'No durable facts to save from this chat',
                                'success'
                              );
                              setView('auto');
                            })
                            .catch((err) => {
                              showToast(
                                err instanceof Error ? err.message : 'Summarize failed',
                                'error'
                              );
                            });
                        }}
                        leftIcon={<Sparkles size={13} strokeWidth={2} />}
                        className="h-auto border-border px-3 py-2 text-caption text-foreground/80 disabled:opacity-40"
                      >
                        Summarize chat
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(true);
                        setEditingId(null);
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2',
                        'text-caption font-medium text-white hover:bg-primary/90'
                      )}
                    >
                      <Plus size={13} strokeWidth={2} />
                      Add
                    </button>
                  </div>

                  <div className="flex gap-1 overflow-x-auto px-5 pb-2 sm:px-6">
                    {(
                      [
                        ['categories', 'Categories', Brain],
                        ['timeline', 'Timeline', Clock],
                        ['pinned', 'Pinned', Pin],
                        ['temporary', 'Temporary', Hourglass],
                        ['auto', 'Auto', Zap],
                      ] as const
                    ).map(([id, label, Icon]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setView(id)}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5',
                          'text-micro font-medium transition-colors',
                          view === id
                            ? 'bg-accent-muted text-accent'
                            : 'text-muted-foreground/70 hover:bg-surface-hover hover:text-foreground'
                        )}
                      >
                        <Icon size={12} strokeWidth={2} />
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4 sm:px-6">
                    <AnimatePresence initial={false}>
                      {creating && (
                        <MemoryEditor
                          saving={memory.isSaving}
                          categories={categoryOptions}
                          onCancel={() => setCreating(false)}
                          onSave={async (data) => {
                            try {
                              await memory.addMemory(data);
                              setCreating(false);
                              showToast('Memory saved', 'success');
                            } catch (err) {
                              showToast(
                                err instanceof Error ? err.message : 'Unable to save memory',
                                'error'
                              );
                            }
                          }}
                        />
                      )}
                    </AnimatePresence>

                    {memory.isLoading && !memory.memories.length ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground/50">
                        <Sparkles size={18} className="animate-pulse" />
                        <span className="text-sm">Loading memories…</span>
                      </div>
                    ) : memory.error ? (
                      <ErrorState
                        compact
                        title="Couldn't load memories"
                        message={memory.error}
                        onRetry={() => void memory.refreshMemories()}
                      />
                    ) : !filteredMemories.length ? (
                      <PremiumEmpty
                        size="sm"
                        icon={Brain}
                        title={
                          view === 'pinned'
                            ? 'No pinned memories'
                            : view === 'temporary'
                              ? 'No temporary memories'
                              : view === 'auto'
                                ? 'No auto memories yet'
                                : 'No memories yet'
                        }
                        description={
                          view === 'pinned'
                            ? 'Pin important facts so they stay at your fingertips.'
                            : view === 'temporary'
                              ? 'Mark a memory as temporary (7 days) or save a task.'
                              : view === 'auto'
                                ? 'VANI will save useful facts automatically as you chat.'
                                : 'Ask VANI to remember something, or add a fact here.'
                        }
                      />
                    ) : view === 'timeline' ? (
                      timelineGroups.map(([bucket, items]) => (
                        <section key={bucket} className="space-y-2">
                          <h3 className="px-1 text-micro font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">
                            {bucket}
                          </h3>
                          {items.map((item) => renderMemoryCard(item))}
                        </section>
                      ))
                    ) : view === 'categories' ? (
                      Array.from(grouped.entries()).map(([cat, items]) => (
                        <section key={cat} className="space-y-2">
                          <h3 className="px-1 text-micro font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">
                            {MEMORY_CATEGORY_LABELS[cat as MemoryCategory] || cat}
                          </h3>
                          {items.map((item) => renderMemoryCard(item))}
                        </section>
                      ))
                    ) : (
                      <section className="space-y-2">
                        {filteredMemories.map((item) => renderMemoryCard(item))}
                      </section>
                    )}
                  </div>
                </>
              ) : (
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
                  <ProfileField
                    label="Preferred name"
                    value={profileDraft.preferredName}
                    onChange={(v) => patchProfile({ preferredName: v })}
 />
                  <ProfileField
                    label="Preferred language"
                    value={profileDraft.preferredLanguage}
                    onChange={(v) => patchProfile({ preferredLanguage: v })}
                    placeholder="e.g. English"
 />
                  <ProfileField
                    label="Timezone"
                    value={profileDraft.timezone}
                    onChange={(v) => patchProfile({ timezone: v })}
                    placeholder="e.g. Asia/Kolkata"
 />
                  <ProfileField
                    label="Profession"
                    value={profileDraft.profession}
                    onChange={(v) => patchProfile({ profession: v })}
 />
                  <ProfileField
                    label="Interests"
                    value={profileDraft.interests}
                    onChange={(v) => patchProfile({ interests: v })}
                    placeholder="Comma-separated"
 />
                  <div className="pt-2 text-micro font-semibold uppercase tracking-[0.06em] text-muted-foreground/50">
                    Preferences
                  </div>
                  <ProfileField
                    label="Response style"
                    value={profileDraft.responseStyle}
                    onChange={(v) => patchProfile({ responseStyle: v })}
 />
                  <ProfileField
                    label="Coding style"
                    value={profileDraft.codingStyle}
                    onChange={(v) => patchProfile({ codingStyle: v })}
 />
                  <ProfileField
                    label="Favorite AI model"
                    value={profileDraft.favoriteModel}
                    onChange={(v) => patchProfile({ favoriteModel: v })}
 />
                  <ProfileField
                    label="UI preferences"
                    value={profileDraft.uiPreferences}
                    onChange={(v) => patchProfile({ uiPreferences: v })}
 />
                  <button
                    type="button"
                    disabled={memory.isSaving}
                    onClick={async () => {
                      await memory.saveSettings({
                        profile: {
                          preferredName: profileDraft.preferredName,
                          preferredLanguage: profileDraft.preferredLanguage,
                          timezone: profileDraft.timezone,
                          profession: profileDraft.profession,
                          interests: profileDraft.interests
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                        preferences: {
                          responseStyle: profileDraft.responseStyle,
                          codingStyle: profileDraft.codingStyle,
                          favoriteModel: profileDraft.favoriteModel,
                          uiPreferences: profileDraft.uiPreferences,
                        },
                      });
                      setProfileOverride(null);
                      showToast('Profile saved', 'success');
                    }}
                    className="w-full rounded-full bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40"
                  >
                    Save profile
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="relative flex items-center justify-between gap-2 border-t border-black/[0.05] px-5 py-3 dark:border-white/[0.06] sm:px-6">
              <span className="text-micro text-muted-foreground/55">
                {memory.total} {memory.total === 1 ? 'memory' : 'memories'}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await memory.exportAll();
                      showToast('Memories exported', 'success');
                    } catch (err) {
                      showToast(
                        err instanceof Error ? err.message : 'Export failed',
                        'error'
                      );
                    }
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5',
                    'text-caption text-foreground/70 hover:bg-surface-hover'
                  )}
                >
                  <Download size={13} />
                  Export
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Delete all memories?',
                      description: 'This permanently clears every saved memory for your account.',
                      confirmLabel: 'Delete all',
                      variant: 'danger',
                    });
                    if (!ok) return;
                    try {
                      await memory.clearAll();
                      prefs.clearAll();
                      showToast('All memories cleared', 'success');
                    } catch (err) {
                      showToast(
                        err instanceof Error ? err.message : 'Unable to clear memories',
                        'error'
                      );
                    }
                  }}
                  className="rounded-full px-3 py-1.5 text-caption text-red-500/80 hover:bg-red-500/10"
                >
                  Clear all
                </button>
              </div>
            </div>
          </motion.div>
    </div>
  );
}

function MemoryCard({
  item,
  editing,
  saving,
  pinned,
  temporary,
  categories = MEMORY_CATEGORIES,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onTogglePin,
  onToggleTemporary,
}: {
  item: MemoryItem;
  editing: boolean;
  saving: boolean;
  pinned: boolean;
  temporary: boolean;
  categories?: readonly MemoryCategory[];
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (data: {
    content: string;
    category: MemoryCategory;
    key?: string;
  }) => Promise<void>;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleTemporary: () => void;
}) {
  if (editing) {
    return (
      <MemoryEditor
        initial={item}
        saving={saving}
        categories={categories}
        onCancel={onCancelEdit}
        onSave={onSave}
      />
    );
  }

  return (
    <motion.article
      layout
      className={cn(
        'group rounded-[16px] px-3.5 py-3',
        'bg-surface-hover',
        'border border-border-subtle',
        pinned && 'border-accent/25 bg-accent-muted/40',
        'hover:border-black/[0.07] dark:hover:border-white/[0.08]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {item.key ? (
              <div className="text-micro font-medium tracking-[-0.01em] text-primary/80">
                {item.key}
              </div>
            ) : null}
            {pinned ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-muted px-1.5 py-0.5 text-micro font-medium text-accent">
                <Pin size={9} strokeWidth={2.5} />
                Pinned
              </span>
            ) : null}
            {temporary ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-micro font-medium text-amber-600 dark:text-amber-400">
                <Hourglass size={9} strokeWidth={2.5} />
                Temporary
              </span>
            ) : null}
            {(item.source === 'auto' || item.source === 'summary') && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-black/[0.04] px-1.5 py-0.5 text-micro font-medium text-muted-foreground dark:bg-white/[0.06]">
                <Zap size={9} strokeWidth={2.5} />
                Auto
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed tracking-[-0.01em] text-foreground/90">
            {item.content}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-micro text-muted-foreground/55">
            <span>{importanceLabel(item.importance)} importance</span>
            <span>·</span>
            <span className="capitalize">{item.source}</span>
            {item.updatedAt && (
              <>
                <span>·</span>
                <span>{formatDate(item.updatedAt)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 sm:opacity-0">
          <button
            type="button"
            aria-label={pinned ? 'Unpin memory' : 'Pin memory'}
            onClick={onTogglePin}
            className={cn(
              'rounded-full p-1.5 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]',
              pinned ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Pin size={13} strokeWidth={pinned ? 2.5 : 1.75} />
          </button>
          <button
            type="button"
            aria-label={temporary ? 'Clear temporary' : 'Mark temporary'}
            onClick={onToggleTemporary}
            className={cn(
              'rounded-full p-1.5 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]',
              temporary
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Hourglass size={13} />
          </button>
          <button
            type="button"
            aria-label="Edit memory"
            onClick={onEdit}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.08]"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            aria-label="Delete memory"
            onClick={onDelete}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </motion.article>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-micro font-medium tracking-[-0.01em] text-muted-foreground/65">
        {label}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'bg-black/[0.03] dark:bg-white/[0.04]',
          'placeholder:text-muted-foreground/35',
          'focus:border-accent/30'
        )}
      />
    </label>
  );
}
