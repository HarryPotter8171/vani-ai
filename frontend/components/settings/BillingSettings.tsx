'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Bot,
  Brain,
  Check,
  ExternalLink,
  FileText,
  Info,
  Monitor,
  Moon,
  Palette,
  Sparkles,
  Sun,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { ErrorState } from '@/components/ui/ErrorState';
import { cn } from '@/lib/utils';
import { useBilling } from '@/hooks/useBilling';
import { useToast } from '@/components/ui/Toast';
import { useThemeContext } from '@/components/layout/ThemeProvider';
import {
  useAppearance,
  type DensityPref,
  type GlassPref,
  type MotionPref,
  type RadiusPref,
  type WallpaperPref,
} from '@/hooks/useAppearance';
import VaniLogo from '@/components/brand/VaniLogo';
import { useAuthUser } from '@/hooks/useAuthUser';
import UserAvatar from '@/components/auth/UserAvatar';
import { useMemory } from '@/hooks/useMemory';
import {
  AUTO_MODEL_KEY,
  fetchModelsCatalog,
  type ModelOption,
} from '@/lib/models';
import { FALLBACK_VOICES } from '@/lib/voice/types';
import type { Theme } from '@/hooks/useTheme';
import {
  METRIC_LABELS,
  type BillingInterval,
  type Invoice,
  type Plan,
  type PlanId,
  type QuotaRemaining,
  type UsageMetric,
} from '@/lib/billing';

export interface BillingSettingsProps {
  open: boolean;
  onClose: () => void;
  onOpenMcp?: () => void;
  onOpenMemory?: () => void;
  /** Deep-link into a settings section when opening. */
  initialSection?: SettingsSection;
  /** Session model selection (AI section). */
  selectedModel?: string;
  onSelectModel?: (modelKey: string) => void;
  projectDefaultModel?: string | null;
}

/** Primary nav sections. `billing` is deep-link only (upgrade CTAs). */
export type SettingsSection =
  | 'general'
  | 'appearance'
  | 'ai'
  | 'memory'
  | 'profile'
  | 'about'
  | 'billing';

const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const VOICE_STORAGE_KEY = 'vani-default-voice';

const NAV: { id: Exclude<SettingsSection, 'billing'>; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'General', icon: Sparkles },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'about', label: 'About', icon: Info },
];

function formatPrice(
  monthly: number | null | undefined,
  yearly: number | null | undefined,
  interval: BillingInterval
): string {
  if (monthly == null && yearly == null) return 'Contact sales';
  if ((monthly ?? 0) === 0 && (yearly ?? 0) === 0) return 'Free';
  if (interval === 'year') {
    if (yearly == null) return 'Contact sales';
    return `$${(yearly / 100).toFixed(yearly % 100 === 0 ? 0 : 2)}/yr`;
  }
  if (monthly == null) return 'Contact sales';
  return `$${(monthly / 100).toFixed(monthly % 100 === 0 ? 0 : 2)}/mo`;
}

function formatCents(cents: number, currency = 'usd'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function formatMetricValue(metric: UsageMetric, value: number): string {
  if (metric === 'file_storage_bytes') {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (metric === 'tokens') {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

function Card({
  children,
  className,
  title,
  description,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}) {
  return (
    <div className={cn('settings-card', className)}>
      {(title || description) && (
        <div className="border-b border-divider px-5 py-4">
          {title ? (
            <h3 className="text-sidebar font-semibold tracking-[-0.02em] text-foreground">
              {title}
            </h3>
          ) : null}
          {description ? (
            <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
      )}
      {children}
    </div>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="min-w-0">
        <p className="text-sidebar font-medium tracking-[-0.016em] text-foreground">{label}</p>
        {description ? (
          <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-full bg-surface-hover p-0.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            'rounded-full px-3 py-1.5 text-caption font-medium transition-all duration-fast ease-apple',
            value === opt.id
              ? 'bg-surface-elevated text-foreground shadow-1'
              : 'text-text-secondary hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors duration-fast',
        checked ? 'bg-accent' : 'bg-surface-hover',
        disabled && 'opacity-50'
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] left-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-1 transition-transform duration-fast',
          checked && 'translate-x-[20px]'
        )}
      />
    </button>
  );
}

function RadioOption({
  selected,
  onSelect,
  label,
  description,
  icon: Icon,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors duration-fast',
        'hover:bg-surface-hover/60',
        selected && 'bg-accent-muted/40'
      )}
    >
      <span
        className={cn(
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-accent' : 'border-border-strong'
        )}
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
      </span>
      {Icon ? (
        <Icon
          size={16}
          strokeWidth={1.75}
          className={selected ? 'text-accent' : 'text-text-secondary'}
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sidebar font-medium text-foreground">{label}</span>
        {description ? (
          <span className="block text-caption text-text-secondary">{description}</span>
        ) : null}
      </span>
      {selected ? <Check size={15} className="text-accent" /> : null}
    </button>
  );
}

function QuotaRow({ row }: { row: QuotaRemaining }) {
  const pct = row.unlimited ? 0 : row.percentUsed ?? 0;
  const barColor = pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-accent';

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {METRIC_LABELS[row.metric]}
        </span>
        <span className="text-micro tabular-nums text-text-secondary">
          {formatMetricValue(row.metric, row.used)}
          {row.unlimited ? ' · Unlimited' : ` / ${formatMetricValue(row.metric, row.limit)}`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
        <div
          className={cn('h-full rounded-full transition-all duration-500 ease-out', barColor)}
          style={{ width: row.unlimited ? '8%' : `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  current,
  currentRank,
  busy,
  interval,
  onSelect,
}: {
  plan: Plan;
  current: boolean;
  currentRank: number;
  busy: boolean;
  interval: BillingInterval;
  onSelect: (planId: PlanId) => void;
}) {
  const label = current
    ? 'Your plan'
    : plan.planId === 'enterprise'
      ? 'Contact sales'
      : plan.planId === 'free'
        ? 'Downgrade'
        : plan.rank > currentRank
          ? 'Upgrade'
          : 'Switch';

  return (
    <div
      className={cn(
        'flex flex-col rounded-[18px] border p-4 transition-all duration-normal ease-apple',
        current
          ? 'border-accent/35 bg-accent-muted'
          : 'border-border bg-surface-secondary hover:border-border-strong'
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold tracking-[-0.02em]">{plan.name}</p>
        {current && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-muted px-2 py-0.5 text-micro font-medium text-accent">
            <Check size={10} strokeWidth={2.5} />
            Current
          </span>
        )}
      </div>
      <p className="mb-2 text-caption font-medium text-foreground/90">
        {formatPrice(plan.priceMonthlyCents, plan.priceYearlyCents, interval)}
      </p>
      <p className="mb-3 flex-1 text-micro leading-relaxed text-text-secondary">
        {plan.description}
      </p>
      <ul className="mb-3 space-y-1">
        {plan.features.slice(0, 4).map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-micro text-text-secondary">
            <Check size={11} className="mt-0.5 shrink-0 text-accent" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={current || busy}
        onClick={() => onSelect(plan.planId)}
        className={cn(
          'inline-flex h-8 items-center justify-center rounded-full px-3 text-caption font-medium',
          'transition-all duration-normal ease-out',
          current
            ? 'cursor-default bg-surface-hover text-text-secondary'
            : 'bg-accent text-text-on-accent hover:bg-accent-hover disabled:opacity-60'
        )}
      >
        {label}
      </button>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-border px-3 py-2.5 transition-colors duration-fast hover:bg-surface-hover">
      <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-surface-hover text-text-secondary">
        <FileText size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {invoice.number || invoice.externalInvoiceId || invoice.id}
        </p>
        <p className="text-micro text-text-secondary">
          {invoice.status}
          {invoice.issuedAt ? ` · ${new Date(invoice.issuedAt).toLocaleDateString()}` : ''}
        </p>
      </div>
      <p className="text-sm font-medium tabular-nums">
        {formatCents(invoice.totalCents, invoice.currency)}
      </p>
      {(invoice.hostedInvoiceUrl || invoice.invoicePdf) && (
        <a
          href={invoice.hostedInvoiceUrl || invoice.invoicePdf || '#'}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-foreground"
          title="Open invoice"
        >
          <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}

function readStoredVoice(): string {
  if (typeof window === 'undefined') return FALLBACK_VOICES[0]?.id || 'Kore';
  return localStorage.getItem(VOICE_STORAGE_KEY) || FALLBACK_VOICES[0]?.id || 'Kore';
}

export default function BillingSettings({
  open,
  onClose,
  onOpenMemory,
  initialSection = 'general',
  selectedModel = AUTO_MODEL_KEY,
  onSelectModel,
}: BillingSettingsProps) {
  const { showToast } = useToast();
  const { theme, setTheme, mounted } = useThemeContext();
  const { prefs, setPrefs } = useAppearance();
  const { name, email } = useAuthUser();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [voiceId, setVoiceId] = useState(readStoredVoice);

  const memory = useMemory({ enabled: open && (section === 'memory' || section === 'general') });
  const memoryEnabled = memory.settings?.enabled !== false;

  const {
    overview,
    loading,
    upgrading,
    error,
    billingInterval,
    setBillingInterval,
    changePlan,
    openPortal,
    cancel,
    resume,
    refresh,
  } = useBilling({
    enabled: open,
    onError: (message) => showToast(message, 'error'),
  });

  useEffect(() => {
    if (open) {
      const allowed =
        NAV.some((n) => n.id === initialSection) || initialSection === 'billing';
      setSection(allowed ? initialSection : 'general');
      setVoiceId(readStoredVoice());
    }
  }, [open, initialSection]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || section !== 'ai') return;
    let cancelled = false;
    setModelsLoading(true);
    void fetchModelsCatalog()
      .then((catalog) => {
        if (!cancelled) setModels(catalog.models.filter((m) => m.enabled));
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, section]);

  const periodLabel = useMemo(() => {
    if (!overview) return '';
    const start = new Date(overview.subscription.currentPeriodStart);
    const end = new Date(overview.subscription.currentPeriodEnd);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [overview]);

  const handleSelect = async (planId: PlanId) => {
    const result = await changePlan(planId, billingInterval);
    if (result?.mode === 'checkout') return;
    if (result?.message) showToast(result.message, 'success');
  };

  const handleCancel = async () => {
    const result = await cancel();
    if (result?.message) showToast(result.message, 'success');
  };

  const handleResume = async () => {
    const result = await resume();
    if (result?.message) showToast(result.message, 'success');
  };

  const invoices = overview?.invoices || [];
  const needsBillingData = section === 'general' || section === 'billing' || section === 'profile';

  const sectionTitle =
    section === 'billing'
      ? 'Billing'
      : NAV.find((n) => n.id === section)?.label || 'Settings';

  const themeOptions: { id: Theme; label: string; icon: LucideIcon; hint: string }[] = [
    { id: 'light', label: 'Light', icon: Sun, hint: 'Bright surfaces' },
    { id: 'dark', label: 'Dark', icon: Moon, hint: 'Low-light surfaces' },
    { id: 'system', label: 'System', icon: Monitor, hint: 'Match your device' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <button
            type="button"
            aria-label="Close settings"
            className="absolute inset-0 modal-overlay"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: EASE }}
            className={cn(
              'relative flex w-full flex-col overflow-hidden',
              'h-[100dvh] rounded-none sm:h-[80vh] sm:w-[90vw] sm:max-w-[740px] sm:rounded-xl',
              'border-0 border-border sm:border',
              'bg-surface text-foreground',
              'shadow-3'
            )}
          >
            {/* Top header */}
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-divider px-5">
              <h2
                id="settings-title"
                className="text-assistant font-semibold tracking-[-0.024em] text-foreground"
              >
                Settings
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-foreground"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
              {/* Left sidebar */}
              <aside
                className={cn(
                  'flex shrink-0 border-b border-divider sm:w-[190px] sm:flex-col sm:border-b-0 sm:border-r',
                  'bg-surface-secondary/80'
                )}
                role="tablist"
                aria-label="Settings sections"
              >
                <nav className="custom-scrollbar flex gap-0.5 overflow-x-auto px-2 py-2 sm:flex-1 sm:flex-col sm:overflow-y-auto sm:px-2.5 sm:py-3">
                  {NAV.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={section === id}
                      onClick={() => setSection(id)}
                      className={cn(
                        'flex h-10 shrink-0 items-center gap-2.5 rounded-[10px] px-3',
                        'text-sm font-medium tracking-[-0.014em]',
                        'transition-all duration-fast ease-apple',
                        section === id
                          ? 'bg-accent-muted text-accent'
                          : 'text-text-secondary hover:bg-surface-hover hover:text-foreground'
                      )}
                    >
                      <Icon size={15} strokeWidth={1.75} />
                      <span className="whitespace-nowrap">{label}</span>
                    </button>
                  ))}
                </nav>
              </aside>

              {/* Right content */}
              <div className="flex min-w-0 flex-1 flex-col bg-background/30">
                <div className="flex h-12 shrink-0 items-center border-b border-divider px-6">
                  <p className="text-sidebar font-semibold tracking-[-0.02em] text-foreground">
                    {sectionTitle}
                  </p>
                </div>

                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-6">
                  {loading && !overview && needsBillingData ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-text-secondary">
                      <Spinner size={16} />
                      Loading…
                    </div>
                  ) : error && !overview && needsBillingData ? (
                    <ErrorState
                      title="Couldn't load billing"
                      message={error}
                      onRetry={() => void refresh()}
                      retrying={loading}
                    />
                  ) : (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={section}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18, ease: EASE }}
                        className="mx-auto flex w-full max-w-[500px] flex-col gap-4"
                      >
                        {section === 'general' && (
                          <>
                            {overview && (
                              <Card title="Plan">
                                <div className="space-y-3 px-5 py-4">
                                  <div>
                                    <p className="text-title font-semibold tracking-[-0.03em]">
                                      {overview.plan.name}
                                    </p>
                                    <p className="mt-1 text-sm text-text-secondary">
                                      {formatPrice(
                                        overview.plan.priceMonthlyCents,
                                        overview.plan.priceYearlyCents,
                                        overview.subscription.billingInterval || 'month'
                                      )}
                                      {periodLabel ? ` · ${periodLabel}` : ''}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setSection('billing')}
                                    className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity duration-fast hover:opacity-90"
                                  >
                                    Manage plan
                                  </button>
                                </div>
                              </Card>
                            )}
                          </>
                        )}

                        {section === 'appearance' && (
                          <>
                            <Card title="Theme">
                              <div className="divide-y divide-divider">
                                {themeOptions.map(({ id, label, icon, hint }) => (
                                  <RadioOption
                                    key={id}
                                    selected={mounted && theme === id}
                                    onSelect={() => setTheme(id)}
                                    label={label}
                                    description={hint}
                                    icon={icon}
                                  />
                                ))}
                              </div>
                            </Card>

                            <Card title="Display">
                              <SettingsRow label="Corner radius" description="Surface roundness">
                                <Segmented<RadiusPref>
                                  value={prefs.radius}
                                  onChange={(radius) => setPrefs({ radius })}
                                  options={[
                                    { id: 'soft', label: 'Soft' },
                                    { id: 'rounded', label: 'Rounded' },
                                    { id: 'sharp', label: 'Sharp' },
                                  ]}
                                />
                              </SettingsRow>
                              <SettingsRow label="Animation" description="Motion across the UI">
                                <Segmented<MotionPref>
                                  value={prefs.motion}
                                  onChange={(motion) => setPrefs({ motion })}
                                  options={[
                                    { id: 'slow', label: 'Slow' },
                                    { id: 'normal', label: 'Normal' },
                                    { id: 'fast', label: 'Fast' },
                                    { id: 'none', label: 'Off' },
                                  ]}
                                />
                              </SettingsRow>
                              <SettingsRow label="Density" description="Spacing in lists and nav">
                                <Segmented<DensityPref>
                                  value={prefs.density}
                                  onChange={(density) => setPrefs({ density })}
                                  options={[
                                    { id: 'comfortable', label: 'Comfort' },
                                    { id: 'compact', label: 'Compact' },
                                  ]}
                                />
                              </SettingsRow>
                              <SettingsRow label="Glass" description="Blur on floating surfaces">
                                <Segmented<GlassPref>
                                  value={prefs.glass}
                                  onChange={(glass) => setPrefs({ glass })}
                                  options={[
                                    { id: 'subtle', label: 'Subtle' },
                                    { id: 'medium', label: 'Medium' },
                                    { id: 'strong', label: 'Strong' },
                                  ]}
                                />
                              </SettingsRow>
                              <SettingsRow label="Wallpaper" description="Ambient background">
                                <Segmented<WallpaperPref>
                                  value={prefs.wallpaper}
                                  onChange={(wallpaper) => setPrefs({ wallpaper })}
                                  options={[
                                    { id: 'default', label: 'Default' },
                                    { id: 'aurora', label: 'Aurora' },
                                    { id: 'mist', label: 'Mist' },
                                    { id: 'none', label: 'None' },
                                  ]}
                                />
                              </SettingsRow>
                            </Card>
                          </>
                        )}

                        {section === 'ai' && (
                          <Card title="Models & voice">
                            <SettingsRow
                              label="Default model"
                              description="Used for new conversations"
                            >
                              {modelsLoading ? (
                                <Spinner size={14} />
                              ) : (
                                <Select
                                  appearance="field"
                                  value={selectedModel || AUTO_MODEL_KEY}
                                  onChange={(e) => onSelectModel?.(e.target.value)}
                                >
                                  <option value={AUTO_MODEL_KEY}>Auto</option>
                                  {models.map((m) => (
                                    <option key={m.key} value={m.key}>
                                      {m.displayName}
                                    </option>
                                  ))}
                                </Select>
                              )}
                            </SettingsRow>
                            <SettingsRow label="Voice" description="Live Mode speaking voice">
                              <Select
                                appearance="field"
                                value={voiceId}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  setVoiceId(next);
                                  try {
                                    localStorage.setItem(VOICE_STORAGE_KEY, next);
                                  } catch {
                                    /* ignore */
                                  }
                                }}
                              >
                                {FALLBACK_VOICES.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name}
                                  </option>
                                ))}
                              </Select>
                            </SettingsRow>
                          </Card>
                        )}

                        {section === 'memory' && (
                          <Card title="Memory">
                            <SettingsRow
                              label="Enable Memory"
                              description="Remember facts across conversations"
                            >
                              {memory.isLoading && !memory.settings ? (
                                <Spinner size={14} />
                              ) : (
                                <Toggle
                                  label="Enable Memory"
                                  checked={memoryEnabled}
                                  disabled={memory.isSaving}
                                  onChange={(next) => {
                                    void memory.setEnabled(next).then(() => {
                                      showToast(
                                        next ? 'Memory turned on' : 'Memory turned off',
                                        'success'
                                      );
                                    });
                                  }}
                                />
                              )}
                            </SettingsRow>
                            <div className="px-5 py-4">
                              <Button
                                type="button"
                                variant="primary"
                                size="md"
                                onClick={() => {
                                  onClose();
                                  onOpenMemory?.();
                                }}
                                leftIcon={<Brain size={14} strokeWidth={1.75} />}
                                className="shadow-none hover:shadow-none"
                              >
                                Manage Memories
                              </Button>
                            </div>
                          </Card>
                        )}

                        {section === 'profile' && (
                          <Card>
                            <div className="flex items-center gap-4 px-5 py-5">
                              <UserAvatar size="xl" />
                              <div className="min-w-0">
                                <p className="truncate text-title font-semibold tracking-[-0.024em]">
                                  {name || 'VANI user'}
                                </p>
                                <p className="truncate text-sm text-text-secondary">{email}</p>
                                {overview && (
                                  <p className="mt-1 text-caption font-medium text-accent">
                                    {overview.plan.name} plan
                                  </p>
                                )}
                              </div>
                            </div>
                          </Card>
                        )}

                        {section === 'about' && (
                          <>
                            <Card>
                              <div className="flex flex-col items-center gap-5 px-6 py-8 text-center">
                                <VaniLogo size="lg" glow />
                                <div>
                                  <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                                    About VANI
                                  </h3>
                                  <dl className="mt-4 space-y-1.5 text-sm text-text-secondary">
                                    <div className="flex items-center justify-center gap-2">
                                      <dt className="text-text-tertiary">Version</dt>
                                      <dd className="font-medium text-foreground">0.1.0</dd>
                                    </div>
                                    <div className="flex items-center justify-center gap-2">
                                      <dt className="text-text-tertiary">Build</dt>
                                      <dd className="font-medium text-foreground tabular-nums">
                                        2026.08
                                      </dd>
                                    </div>
                                    <div className="flex items-center justify-center gap-2">
                                      <dt className="text-text-tertiary">AI Model</dt>
                                      <dd className="font-medium text-foreground">
                                        {selectedModel === AUTO_MODEL_KEY
                                          ? 'Auto'
                                          : selectedModel || 'Auto'}
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                              </div>
                            </Card>

                            <Card>
                              <div className="space-y-4 px-5 py-5 text-sm leading-[1.65] tracking-[-0.011em] text-text-secondary">
                                <p>
                                  VANI is a next-generation AI Operating System built to help people
                                  think faster, create better, learn continuously, and solve
                                  real-world problems through natural conversations.
                                </p>
                                <p>
                                  Whether you&apos;re researching, coding, writing, studying, or
                                  organizing your work, VANI adapts to your workflow and becomes
                                  your intelligent personal assistant.
                                </p>
                                <p>
                                  Our mission is simple:
                                  <br />
                                  <span className="font-medium text-foreground">
                                    Make powerful AI feel effortless, personal, and beautifully
                                    designed.
                                  </span>
                                </p>
                                <p>Built with ❤️ for creators, students, professionals, and innovators.</p>
                              </div>
                            </Card>

                            <p className="px-1 pb-2 text-center text-micro leading-relaxed text-text-tertiary">
                              © 2026 VANI AI
                              <br />
                              All rights reserved.
                            </p>
                          </>
                        )}

                        {section === 'billing' && overview && (
                          <>
                            <Card>
                              <div className="px-5 py-4">
                                <p className="text-sm font-semibold tracking-[-0.02em]">
                                  {overview.plan.name}
                                </p>
                                <p className="mt-1 text-sm text-text-secondary">
                                  {formatPrice(
                                    overview.plan.priceMonthlyCents,
                                    overview.plan.priceYearlyCents,
                                    overview.subscription.billingInterval || 'month'
                                  )}
                                  {overview.subscription.billingInterval
                                    ? ` · billed ${overview.subscription.billingInterval}ly`
                                    : ''}
                                  {periodLabel ? ` · ${periodLabel}` : ''}
                                </p>
                                {overview.subscription.cancelAtPeriodEnd && (
                                  <p className="mt-2 text-caption text-warning">
                                    Cancels at period end. You keep access until then.
                                  </p>
                                )}
                              </div>
                            </Card>

                            <Card title="Usage this period" description="Monthly limits for your plan">
                              <div className="grid gap-4 px-5 py-4">
                                {overview.remaining.map((row) => (
                                  <QuotaRow key={row.metric} row={row} />
                                ))}
                              </div>
                            </Card>

                            <Card title="Payment & portal">
                              <div className="px-5 py-4">
                                <p className="mb-4 text-sm leading-relaxed text-text-secondary">
                                  {overview.razorpayEnabled && overview.stripeEnabled
                                    ? 'Manage payment methods via Razorpay or Stripe depending on your subscription.'
                                    : overview.razorpayEnabled
                                      ? 'Razorpay Checkout supports UPI, cards, and net banking.'
                                      : overview.stripeEnabled
                                        ? 'Update payment methods and invoices in the Stripe customer portal.'
                                        : 'No payment gateway configured — plan changes apply locally for testing.'}
                                </p>
                                {overview.stripeEnabled &&
                                  overview.subscription.paymentProvider !== 'razorpay' && (
                                    <button
                                      type="button"
                                      disabled={upgrading}
                                      onClick={() => void openPortal()}
                                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-caption font-medium text-background transition-all duration-fast disabled:opacity-60"
                                    >
                                      Customer Portal
                                      <ExternalLink size={12} />
                                    </button>
                                  )}
                              </div>
                            </Card>

                            <section className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold tracking-[-0.02em]">Plans</h3>
                                <Segmented
                                  value={billingInterval}
                                  onChange={setBillingInterval}
                                  options={[
                                    { id: 'month', label: 'Monthly' },
                                    { id: 'year', label: 'Yearly' },
                                  ]}
                                />
                              </div>
                              <div className="grid gap-3">
                                {overview.plans.map((plan) => (
                                  <PlanCard
                                    key={plan.planId}
                                    plan={plan}
                                    current={plan.planId === overview.plan.planId}
                                    currentRank={overview.plan.rank}
                                    busy={upgrading}
                                    interval={billingInterval}
                                    onSelect={handleSelect}
                                  />
                                ))}
                              </div>
                            </section>

                            <section className="space-y-3">
                              <h3 className="text-sm font-semibold tracking-[-0.02em]">Invoices</h3>
                              {invoices.length === 0 ? (
                                <PremiumEmpty
                                  size="sm"
                                  icon={FileText}
                                  title="No invoices yet"
                                  description="Invoices appear here after a plan purchase or renewal."
                                  className="rounded-xl border border-dashed border-border py-8"
                                />
                              ) : (
                                <div className="space-y-2">
                                  {invoices.map((inv) => (
                                    <InvoiceRow key={inv.id} invoice={inv} />
                                  ))}
                                </div>
                              )}
                            </section>

                            <Card className="border-danger/20">
                              <div className="px-5 py-4">
                                <div className="mb-2 flex items-center gap-2">
                                  <AlertTriangle size={15} className="text-danger" />
                                  <h3 className="text-sm font-semibold tracking-[-0.02em] text-danger">
                                    Cancel subscription
                                  </h3>
                                </div>
                                <p className="mb-4 text-sm leading-relaxed text-text-secondary">
                                  {overview.plan.planId === 'free'
                                    ? 'You are on the free plan. There is nothing to cancel.'
                                    : overview.subscription.cancelAtPeriodEnd
                                      ? 'Your plan is already set to cancel at the end of the billing period.'
                                      : 'Your plan stays active until the end of the current billing period. You can resume anytime before then.'}
                                </p>
                                {overview.plan.planId !== 'free' &&
                                  !overview.subscription.cancelAtPeriodEnd && (
                                    <button
                                      type="button"
                                      disabled={upgrading}
                                      onClick={() => void handleCancel()}
                                      className="inline-flex h-8 items-center rounded-full bg-danger px-3 text-caption font-medium text-white transition-all duration-fast hover:opacity-90 disabled:opacity-60"
                                    >
                                      Cancel plan
                                    </button>
                                  )}
                                {overview.subscription.cancelAtPeriodEnd &&
                                  overview.subscription.paymentProvider !== 'razorpay' && (
                                    <button
                                      type="button"
                                      disabled={upgrading}
                                      onClick={() => void handleResume()}
                                      className="inline-flex h-8 items-center rounded-full px-3 text-caption font-medium text-accent transition-colors duration-fast hover:bg-accent-muted disabled:opacity-60"
                                    >
                                      Resume plan
                                    </button>
                                  )}
                              </div>
                            </Card>
                          </>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
