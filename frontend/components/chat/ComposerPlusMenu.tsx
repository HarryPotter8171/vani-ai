'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Camera,
  Check,
  FlaskConical,
  Globe,
  ImageIcon,
  LayoutTemplate,
  Plus,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DROPDOWN_MOTION } from '@/lib/motion';

export interface ComposerPlusMenuProps {
  disabled?: boolean;
  webSearchEnabled?: boolean;
  deepResearchEnabled?: boolean;
  onUpload: () => void;
  onCamera: () => void;
  onImage: () => void;
  onCanvas?: () => void;
  onToggleWebSearch?: (value: boolean) => void;
  onToggleDeepResearch?: (value: boolean) => void;
  /** @deprecated Voice lives on the composer mic — ignored. */
  onVoice?: () => void;
}

type MenuItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  onSelect: () => void;
  active?: boolean;
};

export default function ComposerPlusMenu({
  disabled,
  webSearchEnabled = false,
  deepResearchEnabled = false,
  onUpload,
  onCamera,
  onImage,
  onCanvas,
  onToggleWebSearch,
  onToggleDeepResearch,
}: ComposerPlusMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const closeAnd = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const uploadItems: MenuItem[] = [
    {
      id: 'upload',
      label: 'Upload',
      icon: Upload,
      onSelect: closeAnd(onUpload),
    },
    {
      id: 'camera',
      label: 'Camera',
      icon: Camera,
      onSelect: closeAnd(onCamera),
    },
    {
      id: 'image',
      label: 'Image',
      icon: ImageIcon,
      onSelect: closeAnd(onImage),
    },
  ];

  const toolItems: MenuItem[] = [
    ...(onCanvas
      ? [
          {
            id: 'canvas',
            label: 'Canvas',
            icon: LayoutTemplate,
            onSelect: closeAnd(onCanvas),
          } satisfies MenuItem,
        ]
      : []),
    ...(onToggleDeepResearch
      ? [
          {
            id: 'deep-research',
            label: 'Deep Research',
            icon: FlaskConical,
            active: deepResearchEnabled,
            onSelect: closeAnd(() => onToggleDeepResearch(!deepResearchEnabled)),
          } satisfies MenuItem,
        ]
      : []),
    ...(onToggleWebSearch
      ? [
          {
            id: 'web-search',
            label: 'Web Search',
            icon: Globe,
            active: webSearchEnabled,
            onSelect: closeAnd(() => onToggleWebSearch(!webSearchEnabled)),
          } satisfies MenuItem,
        ]
      : []),
  ];

  const sections = [uploadItems, toolItems].filter((s) => s.length > 0);
  const hasActiveTool = webSearchEnabled || deepResearchEnabled;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'hover-lift flex h-8 w-8 items-center justify-center rounded-full',
          'transition-all duration-normal ease-out',
          open || hasActiveTool
            ? 'bg-surface-hover text-foreground'
            : 'text-muted-foreground/65 hover:bg-surface-hover hover:text-foreground',
          'disabled:cursor-not-allowed disabled:opacity-40'
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add attachments and tools"
        data-testid="composer-plus-menu"
      >
        <Plus
          size={18}
          strokeWidth={1.75}
          className={cn('transition-transform duration-normal ease-spring', open && 'rotate-45')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            {...DROPDOWN_MOTION}
            className={cn(
              'absolute bottom-full left-0 z-50 mb-2.5 w-[min(220px,calc(100vw-2rem))] overflow-hidden',
              'rounded-[18px] menu-surface shadow-token-lg'
            )}
          >
            <div className="py-1.5">
              {sections.map((section, sectionIndex) => (
                <React.Fragment key={sectionIndex}>
                  {sectionIndex > 0 ? (
                    <div className="my-1.5 border-t border-border" />
                  ) : null}
                  {section.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        disabled={disabled}
                        onClick={item.onSelect}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left',
                          'transition-colors duration-fast ease-apple',
                          item.active
                            ? 'bg-accent-muted text-accent'
                            : 'text-foreground hover:bg-surface-hover',
                          'disabled:cursor-not-allowed disabled:opacity-40'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded-[10px]',
                            item.active
                              ? 'bg-accent/15 text-accent'
                              : 'bg-surface-hover text-text-secondary'
                          )}
                        >
                          <Icon size={14} strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-medium tracking-[-0.014em]">
                          {item.label}
                        </span>
                        {item.active ? <Check size={14} className="text-accent" /> : null}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
