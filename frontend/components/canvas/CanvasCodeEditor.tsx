'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { cn } from '@/lib/utils';
import type { CanvasType } from '@/lib/canvas/types';

const PRISM_LANG: Record<string, string> = {
  markdown: 'markdown',
  richtext: 'markup',
  code: 'javascript',
  html: 'markup',
  react: 'jsx',
  mermaid: 'markdown',
  json: 'json',
  csv: 'markdown',
  plaintext: 'markdown',
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  sql: 'sql',
  css: 'css',
  jsx: 'jsx',
  tsx: 'tsx',
};

interface CanvasCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  type: CanvasType;
  language?: string | null;
  wordWrap?: boolean;
  onSelectionChange?: (selection: { start: number; end: number; text: string }) => void;
  findQuery?: string;
  replaceQuery?: string;
  findOpen?: boolean;
  onFindOpenChange?: (open: boolean) => void;
}

export default function CanvasCodeEditor({
  value,
  onChange,
  type,
  language,
  wordWrap,
  onSelectionChange,
  findQuery = '',
  replaceQuery = '',
  findOpen,
  onFindOpenChange,
}: CanvasCodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [history, setHistory] = useState<string[]>([value]);
  const historyIndexRef = useRef(0);
  const skipHistory = useRef(false);
  const [localFind, setLocalFind] = useState('');
  const [localReplace, setLocalReplace] = useState('');
  const [showFind, setShowFind] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);

  const prismLang = PRISM_LANG[language || type] || PRISM_LANG[type] || 'markdown';
  const isFindOpen = findOpen ?? showFind;
  const query = findQuery || localFind;
  const replace = replaceQuery || localReplace;

  const matches = useMemo(() => {
    if (!query) return [] as number[];
    const indices: number[] = [];
    const hay = value;
    const needle = query;
    let from = 0;
    while (from <= hay.length) {
      const idx = hay.indexOf(needle, from);
      if (idx === -1) break;
      indices.push(idx);
      from = idx + Math.max(needle.length, 1);
    }
    return indices;
  }, [value, query]);

  useEffect(() => {
    if (skipHistory.current) {
      skipHistory.current = false;
      return;
    }
    if (value === history[historyIndexRef.current]) return;
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndexRef.current + 1);
      const next = [...trimmed, value].slice(-100);
      historyIndexRef.current = next.length - 1;
      return next;
    });
  }, [value, history]);

  const pushSelection = useCallback(() => {
    const el = textareaRef.current;
    if (!el || !onSelectionChange) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    onSelectionChange({ start, end, text: value.slice(start, end) });
  }, [onSelectionChange, value]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    const next = historyIndexRef.current - 1;
    historyIndexRef.current = next;
    skipHistory.current = true;
    onChange(history[next] ?? '');
  }, [history, onChange]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= history.length - 1) return;
    const next = historyIndexRef.current + 1;
    historyIndexRef.current = next;
    skipHistory.current = true;
    onChange(history[next] ?? '');
  }, [history, onChange]);

  const jumpToMatch = useCallback(
    (index: number) => {
      if (!matches.length || !textareaRef.current) return;
      const safe = ((index % matches.length) + matches.length) % matches.length;
      setMatchIndex(safe);
      const start = matches[safe];
      const end = start + query.length;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(start, end);
      pushSelection();
    },
    [matches, query.length, pushSelection]
  );

  const replaceOne = useCallback(() => {
    if (!matches.length) return;
    const start = matches[matchIndex] ?? matches[0];
    const end = start + query.length;
    const next = value.slice(0, start) + replace + value.slice(end);
    onChange(next);
  }, [matches, matchIndex, query.length, replace, value, onChange]);

  const replaceAll = useCallback(() => {
    if (!query) return;
    onChange(value.split(query).join(replace));
  }, [onChange, query, replace, value]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (meta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }
    if (meta && e.key === 'f') {
      e.preventDefault();
      setShowFind(true);
      onFindOpenChange?.(true);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = value.slice(0, start) + '  ' + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  const lineCount = Math.max(value.split('\n').length, 1);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#1e1e1e]">
      {isFindOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] bg-[#252526] px-3 py-2">
          <input
            value={query}
            onChange={(e) => {
              setLocalFind(e.target.value);
              setMatchIndex(0);
            }}
            placeholder="Find"
            className="h-7 w-40 rounded-md border border-white/10 bg-black/30 px-2 text-caption text-white"
 />
          <input
            value={replace}
            onChange={(e) => setLocalReplace(e.target.value)}
            placeholder="Replace"
            className="h-7 w-40 rounded-md border border-white/10 bg-black/30 px-2 text-caption text-white"
 />
          <button
            type="button"
            onClick={() => jumpToMatch(matchIndex - 1)}
            className="rounded px-2 py-1 text-micro text-white/70 hover:bg-white/10"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => jumpToMatch(matchIndex + 1)}
            className="rounded px-2 py-1 text-micro text-white/70 hover:bg-white/10"
          >
            Next
          </button>
          <button
            type="button"
            onClick={replaceOne}
            className="rounded px-2 py-1 text-micro text-white/70 hover:bg-white/10"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={replaceAll}
            className="rounded px-2 py-1 text-micro text-white/70 hover:bg-white/10"
          >
            All
          </button>
          <span className="text-micro text-white/40">
            {matches.length ? `${matchIndex + 1}/${matches.length}` : 'No matches'}
          </span>
          <button
            type="button"
            onClick={() => {
              setShowFind(false);
              onFindOpenChange?.(false);
            }}
            className="ml-auto rounded px-2 py-1 text-micro text-white/50 hover:bg-white/10"
          >
            Close
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          aria-hidden
          className="custom-scrollbar shrink-0 select-none overflow-hidden border-r border-white/[0.06] py-4 pl-3 pr-2 text-right font-mono text-sm leading-[1.7] text-white/25"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-0 overflow-hidden',
              wordWrap ? 'overflow-x-hidden' : 'overflow-x-auto'
            )}
          >
            <Highlight theme={themes.vsDark} code={value || ' '} language={prismLang}>
              {({ className, style, tokens, getLineProps, getTokenProps }) => (
                <pre
                  className={cn(className, 'm-0 px-4 py-4 font-mono text-sm leading-[1.7]')}
                  style={{ ...style, backgroundColor: 'transparent' }}
                >
                  {tokens.map((line, lineIndex) => {
                    const lineProps = getLineProps({ line });
                    return (
                      <div
                        {...lineProps}
                        key={lineIndex}
                        className={cn(lineProps.className, wordWrap && 'whitespace-pre-wrap break-words')}
                      >
                        {line.map((token, tokenIndex) => {
                          const tokenProps = getTokenProps({ token });
                          return <span {...tokenProps} key={tokenIndex} />;
                        })}
                      </div>
                    );
                  })}
                </pre>
              )}
            </Highlight>
          </div>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onSelect={pushSelection}
            onKeyUp={pushSelection}
            onClick={pushSelection}
            onKeyDown={onKeyDown}
            spellCheck={type === 'markdown' || type === 'plaintext' || type === 'richtext'}
            aria-label="Canvas editor"
            className={cn(
              'custom-scrollbar absolute inset-0 h-full w-full resize-none border-0 bg-transparent px-4 py-4',
              'font-mono text-sm leading-[1.7] text-transparent caret-white',
              'focus-ring-token',
              wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'
            )}
 />
        </div>
      </div>
    </div>
  );
}
