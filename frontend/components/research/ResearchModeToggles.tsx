'use client';

import React from 'react';
import { FlaskConical, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ResearchModeTogglesProps {
  webSearchEnabled: boolean;
  deepResearchEnabled: boolean;
  onToggleWebSearch: (value: boolean) => void;
  onToggleDeepResearch: (value: boolean) => void;
  disabled?: boolean;
}

export default function ResearchModeToggles({
  webSearchEnabled,
  deepResearchEnabled,
  onToggleWebSearch,
  onToggleDeepResearch,
  disabled,
}: ResearchModeTogglesProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 pb-0.5 pt-0.5">
      <ModePill
        active={webSearchEnabled}
        disabled={disabled}
        onClick={() => onToggleWebSearch(!webSearchEnabled)}
        icon={<Globe size={13} strokeWidth={2} />}
        label="Web Search"
        ariaLabel="Toggle web search"
 />
      <ModePill
        active={deepResearchEnabled}
        disabled={disabled}
        onClick={() => onToggleDeepResearch(!deepResearchEnabled)}
        icon={<FlaskConical size={13} strokeWidth={2} />}
        label="Deep Research"
        ariaLabel="Toggle deep research"
 />
    </div>
  );
}

function ModePill({
  active,
  disabled,
  onClick,
  icon,
  label,
  ariaLabel,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={cn(
        'hover-lift inline-flex h-8 items-center gap-1.5 rounded-full px-2.5',
        'text-sm font-medium tracking-[-0.01em]',
        'transition-all duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
        active
          ? 'bg-accent-muted text-accent ring-1 ring-accent/20'
          : 'text-muted-foreground/85 hover:bg-foreground/[0.045] hover:text-foreground dark:hover:bg-white/[0.06]',
        'disabled:opacity-50'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
