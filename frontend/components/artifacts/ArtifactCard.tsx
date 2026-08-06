'use client';

import { FileCode2, ChevronRight } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import type { Artifact } from '@/lib/artifacts';
import { LANGUAGE_INFO } from '@/lib/artifacts';

interface ArtifactCardProps {
  artifact: Artifact;
  isActive: boolean;
  onOpen: (id: string) => void;
}

export default function ArtifactCard({ artifact, isActive, onOpen }: ArtifactCardProps) {
  const info = LANGUAGE_INFO[artifact.language];
  const lineCount = artifact.content.split('\n').length;

  return (
    <button
      type="button"
      onClick={() => onOpen(artifact.id)}
      className={cn(
        'hover-lift group my-2 flex w-full max-w-[420px] items-center gap-3 rounded-[16px] px-4 py-3 text-left',
        'bg-white/[0.5] dark:bg-white/[0.04]',
        'backdrop-blur-xl border transition-colors duration-200',
        isActive
          ? 'border-primary/40 bg-primary/[0.06] dark:bg-primary/[0.1]'
          : 'border-black/[0.06] dark:border-white/[0.07] hover:border-black/[0.1] dark:hover:border-white/[0.14]'
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]',
          'bg-primary/10 text-primary dark:bg-primary/15'
        )}
      >
        {artifact.isStreaming ? (
          <Spinner size={16} />
        ) : (
          <FileCode2 size={16} strokeWidth={2.25} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{artifact.title}</div>
        <div className="text-micro text-muted-foreground">
          {info.label}
          {artifact.isStreaming ? ' · Generating…' : ` · ${lineCount} lines`}
        </div>
      </div>

      <ChevronRight
        size={16}
        strokeWidth={2}
        className="shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5"
 />
    </button>
  );
}
