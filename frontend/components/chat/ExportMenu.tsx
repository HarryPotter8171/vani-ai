'use client';

import React, { useRef, useState } from 'react';
import { Download, FileCode, FileText, FileType2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useToast } from '@/components/ui/Toast';
import { buildMarkdownExport } from '@/lib/export/markdownExport';
import { buildTextExport } from '@/lib/export/textExport';
import { buildExportFilename } from '@/lib/export/shared';
import { downloadTextFile } from '@/lib/export/download';
import type { Message } from '@/lib/types';

export interface ExportMenuProps {
  messages: Message[];
  conversationTitle: string;
}

type ExportFormat = 'markdown' | 'txt' | 'pdf';

const FORMATS: { id: ExportFormat; label: string; hint: string; icon: typeof FileCode }[] = [
  { id: 'markdown', label: 'Markdown', hint: '.md — keeps formatting', icon: FileCode },
  { id: 'txt', label: 'Plain Text', hint: '.txt — readable prose', icon: FileText },
  { id: 'pdf', label: 'PDF', hint: '.pdf — printable', icon: FileType2 },
];

export default function ExportMenu({ messages, conversationTitle }: ExportMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useOnClickOutside(containerRef, () => setMenuOpen(false), menuOpen);

  const hasContent = messages.some((m) => m.content.trim() || m.attachments?.length);

  const handleExport = async (format: ExportFormat) => {
    setMenuOpen(false);
    try {
      if (format === 'markdown') {
        downloadTextFile(
          buildMarkdownExport(messages, conversationTitle),
          buildExportFilename(conversationTitle, 'md'),
          'text/markdown'
        );
      } else if (format === 'txt') {
        downloadTextFile(
          buildTextExport(messages, conversationTitle),
          buildExportFilename(conversationTitle, 'txt'),
          'text/plain'
        );
      } else {
        const { exportConversationToPdf } = await import('@/lib/export/pdfExport');
        await exportConversationToPdf(messages, conversationTitle);
      }
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Unable to export this conversation. Please try again.', 'error');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        disabled={!hasContent}
        className={cn(
          'hover-lift inline-flex h-7 w-7 items-center justify-center rounded-full',
          'text-muted-foreground/80',
          'transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
          'hover:bg-foreground/[0.045] hover:text-foreground',
          'dark:hover:bg-white/[0.06]',
          'disabled:pointer-events-none disabled:opacity-35',
          menuOpen && 'bg-foreground/[0.045] text-foreground dark:bg-white/[0.06]'
        )}
        aria-label="Export conversation"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <Download size={15} strokeWidth={1.75} />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 bottom-full mb-2 z-30 w-[216px] overflow-hidden rounded-[16px]',
            'menu-surface rounded-[16px] shadow-token-lg',
            'animate-fade-up'
          )}
        >
          <div className="px-3.5 pb-1.5 pt-3 text-micro font-semibold uppercase tracking-[0.08em] text-muted-foreground/45">
            Export conversation
          </div>
          {FORMATS.map(({ id, label, hint, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => handleExport(id)}
              className={cn(
                'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left',
                'text-foreground/85 hover:bg-surface-hover'
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-primary/[0.08] text-primary dark:bg-primary/[0.16]">
                <Icon size={13} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium tracking-[-0.014em]">{label}</span>
                <span className="block truncate text-micro text-muted-foreground/60">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
