'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DROPDOWN_MOTION } from '@/lib/motion';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  separator?: boolean;
}

export interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end';
  side?: 'top' | 'bottom';
  className?: string;
  menuClassName?: string;
  disabled?: boolean;
}

/**
 * Premium animated dropdown — spring scale, glass surface, keyboard nav.
 */
export function Dropdown({
  trigger,
  items,
  align = 'end',
  side = 'bottom',
  className,
  menuClassName,
  disabled,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useOnClickOutside(rootRef, () => setOpen(false), open);

  const actionable = items.filter((i) => !i.separator && !i.disabled);

  useEffect(() => {
    if (!open) setActiveIndex(-1);
  }, [open]);

  const selectItem = useCallback((item: DropdownItem) => {
    if (item.disabled || item.separator) return;
    item.onSelect?.();
    setOpen(false);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(actionable.length - 1, Math.max(0, i + 1)));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = actionable[activeIndex];
      if (item) selectItem(item);
    }
  };

  return (
    <div ref={rootRef} className={cn('relative inline-flex', className)} onKeyDown={onKeyDown}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(disabled && 'pointer-events-none opacity-50')}
      >
        {trigger}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            {...DROPDOWN_MOTION}
            className={cn(
              'absolute z-50 min-w-[180px] overflow-hidden rounded-[16px] p-1.5',
              'menu-surface',
              side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
              align === 'end' ? 'right-0' : 'left-0',
              menuClassName
            )}
          >
            {items.map((item, idx) => {
              if (item.separator) {
                return (
                  <div
                    key={`sep-${idx}`}
                    role="separator"
                    className="my-1 h-px bg-divider"
 />
                );
              }
              const actionableIdx = actionable.findIndex((a) => a.id === item.id);
              const active = actionableIdx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onMouseEnter={() => setActiveIndex(actionableIdx)}
                  onClick={() => selectItem(item)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2',
                    'text-left text-sm font-medium tracking-[-0.014em]',
                    'transition-colors duration-fast ease-apple',
                    item.danger
                      ? 'text-danger hover:bg-danger-muted'
                      : 'text-foreground hover:bg-surface-hover',
                    active && !item.danger && 'bg-surface-hover',
                    active && item.danger && 'bg-danger-muted',
                    item.disabled && 'opacity-40'
                  )}
                >
                  {item.icon ? (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary">
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.shortcut ? (
                    <span className="text-micro font-semibold tabular-nums text-text-tertiary">
                      {item.shortcut}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Dropdown;
