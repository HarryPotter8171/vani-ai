'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Paperclip,
  BookOpen,
  FileSearch,
  Search,
  ImageIcon,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion';
import type { DropActionId } from '@/lib/workspace/types';

const ACTIONS: {
  id: DropActionId;
  label: string;
  description: string;
  icon: LucideIcon;
  needsProject?: boolean;
}[] = [
  {
    id: 'attach',
    label: 'Attach to chat',
    description: 'Add as message attachment',
    icon: Paperclip,
  },
  {
    id: 'knowledge',
    label: 'Add to knowledge',
    description: 'Index in project workspace',
    icon: BookOpen,
    needsProject: true,
  },
  {
    id: 'summarize',
    label: 'Summarize',
    description: 'Ask VANI for a brief',
    icon: FileSearch,
  },
  {
    id: 'research',
    label: 'Research',
    description: 'Deep research from this file',
    icon: Search,
  },
  {
    id: 'image',
    label: 'Use as image',
    description: 'Attach for vision / edit',
    icon: ImageIcon,
  },
];

export interface DropActionsOverlayProps {
  open: boolean;
  hasProject: boolean;
  fileCount?: number;
  onAction: (action: DropActionId) => void;
  onCancel: () => void;
}

/**
 * Contextual actions when files are dragged into the workspace.
 */
export default function DropActionsOverlay({
  open,
  hasProject,
  fileCount = 0,
  onAction,
  onCancel,
}: DropActionsOverlayProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="Cancel drop"
            className="absolute inset-0 bg-black/35 backdrop-blur-[6px]"
            onClick={onCancel}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="File drop actions"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={SPRING.soft}
            className={cn(
              'relative w-full max-w-[440px] overflow-hidden rounded-[24px] p-5',
              'border border-border bg-surface-glass-strong',
              'backdrop-blur-[32px] shadow-3'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-text-on-accent shadow-2">
                <Upload size={18} strokeWidth={2.25} />
              </span>
              <div>
                <p className="text-body font-semibold tracking-[-0.02em] text-foreground">
                  What should VANI do?
                </p>
                <p className="text-sm text-text-secondary">
                  {fileCount > 1 ? `${fileCount} files ready` : 'Choose a contextual action'}
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              {ACTIONS.map(({ id, label, description, icon: Icon, needsProject }) => {
                const disabled = needsProject && !hasProject;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onAction(id)}
                    className={cn(
                      'flex items-start gap-3 rounded-[16px] border border-border px-3.5 py-3 text-left',
                      'bg-surface-glass transition-all duration-fast ease-apple',
                      'hover:border-accent/25 hover:bg-surface-hover',
                      'disabled:cursor-not-allowed disabled:opacity-45'
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-accent-muted text-accent">
                      <Icon size={15} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold tracking-[-0.016em] text-foreground">
                        {label}
                      </span>
                      <span className="block text-micro text-text-secondary">
                        {disabled
                          ? 'Select a project to use knowledge'
                          : description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
