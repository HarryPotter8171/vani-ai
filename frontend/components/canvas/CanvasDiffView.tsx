'use client';

import { diffLines } from '@/lib/canvas/diff';
import { cn } from '@/lib/utils';

interface CanvasDiffViewProps {
  before: string;
  after: string;
}

export default function CanvasDiffView({ before, after }: CanvasDiffViewProps) {
  const lines = diffLines(before, after);

  return (
    <div className="custom-scrollbar h-full overflow-auto font-mono text-caption leading-[1.65]">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            'flex gap-3 px-3',
            line.kind === 'add' && 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
            line.kind === 'remove' && 'bg-rose-500/10 text-rose-800 dark:text-rose-200',
            line.kind === 'equal' && 'text-foreground/80'
          )}
        >
          <span className="w-8 shrink-0 select-none text-right text-muted-foreground/50">
            {line.leftNo ?? ''}
          </span>
          <span className="w-8 shrink-0 select-none text-right text-muted-foreground/50">
            {line.rightNo ?? ''}
          </span>
          <span className="w-4 shrink-0 select-none text-muted-foreground/60">
            {line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}
          </span>
          <span className="whitespace-pre-wrap break-words">{line.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}
