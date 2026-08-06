'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { MENU_MOTION } from '@/lib/motion';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  separator?: boolean;
}

export interface ContextMenuProps {
  children: React.ReactNode;
  items: ContextMenuItem[];
  disabled?: boolean;
  className?: string;
}

/**
 * Beautiful right-click context menu — portal + spring + keyboard nav.
 */
export function ContextMenu({
  children,
  items,
  disabled,
  className,
}: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const actionable = items.filter((i) => !i.separator && !i.disabled);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    const onScroll = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(actionable.length - 1, i + 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = actionable[activeIndex];
        if (item) {
          item.onSelect?.();
          close();
        }
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, actionable, activeIndex]);

  const onContextMenu = (e: React.MouseEvent) => {
    if (disabled || !items.length) return;
    e.preventDefault();
    e.stopPropagation();

    const pad = 8;
    const menuW = 220;
    const menuH = Math.min(320, items.length * 36 + 16);
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuW > window.innerWidth - pad) x = window.innerWidth - menuW - pad;
    if (y + menuH > window.innerHeight - pad) y = window.innerHeight - menuH - pad;
    x = Math.max(pad, x);
    y = Math.max(pad, y);

    setPos({ x, y });
    setActiveIndex(0);
    setOpen(true);
  };

  const menu = open ? (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        role="menu"
        {...MENU_MOTION}
        style={{ left: pos.x, top: pos.y }}
        className={cn(
          'fixed z-[300] min-w-[200px] overflow-hidden rounded-[16px] p-1.5',
          'menu-surface'
        )}
      >
        {items.map((item, idx) => {
          if (item.separator) {
            return (
              <div key={`sep-${idx}`} role="separator" className="my-1 h-px bg-divider" />
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
              onClick={() => {
                if (item.disabled) return;
                item.onSelect?.();
                close();
              }}
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
    </AnimatePresence>
  ) : null;

  return (
    <div className={className} onContextMenu={onContextMenu}>
      {children}
      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

export default ContextMenu;
