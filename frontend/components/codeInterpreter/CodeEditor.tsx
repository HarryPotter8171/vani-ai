'use client';

import type { KeyboardEvent } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { cn } from '@/lib/utils';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  disabled?: boolean;
  className?: string;
}

export default function CodeEditor({
  value,
  onChange,
  onRun,
  disabled,
  className,
}: CodeEditorProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun?.();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div
      className={cn(
        'relative min-h-[200px] flex-1 overflow-hidden rounded-xl',
        'bg-[#0d1117]',
        'ring-1 ring-black/10 dark:ring-white/10',
        'focus-within:ring-2 focus-within:ring-accent/45',
        className
      )}
    >
      <Highlight theme={themes.vsDark} code={value.endsWith('\n') ? value : `${value}\n`} language="python">
        {({ className: preClass, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              preClass,
              'pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-3 font-mono text-sm leading-[1.65]'
            )}
            style={{ ...style, backgroundColor: 'transparent' }}
            aria-hidden
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })} className="table-row">
                {line.map((token, j) => (
                  <span key={j} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        spellCheck={false}
        className={cn(
          'absolute inset-0 z-10 h-full w-full resize-none overflow-auto',
          'bg-transparent px-3 py-3 font-mono text-sm leading-[1.65]',
          'whitespace-pre-wrap break-words text-transparent caret-[#e6edf3]',
          'focus-ring-token disabled:cursor-not-allowed'
        )}
        aria-label="Python code editor"
 />
    </div>
  );
}
