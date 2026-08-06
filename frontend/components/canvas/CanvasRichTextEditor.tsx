'use client';

import { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CanvasRichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSelectionChange?: (selection: { start: number; end: number; text: string }) => void;
}

function exec(command: string, arg?: string) {
  document.execCommand(command, false, arg);
}

export default function CanvasRichTextEditor({
  value,
  onChange,
  onSelectionChange,
}: CanvasRichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastHtml = useRef(value);

  useEffect(() => {
    if (!ref.current) return;
    if (value !== lastHtml.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || '';
      lastHtml.current = value;
    }
  }, [value]);

  const emit = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    lastHtml.current = html;
    onChange(html);

    const selection = window.getSelection();
    if (selection && onSelectionChange) {
      const text = selection.toString();
      onSelectionChange({ start: 0, end: text.length, text });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-black/[0.06] px-3 py-2 dark:border-white/[0.06]">
        {[
          { icon: Bold, label: 'Bold', cmd: 'bold' },
          { icon: Italic, label: 'Italic', cmd: 'italic' },
          { icon: Underline, label: 'Underline', cmd: 'underline' },
          { icon: List, label: 'Bullet list', cmd: 'insertUnorderedList' },
          { icon: ListOrdered, label: 'Numbered list', cmd: 'insertOrderedList' },
        ].map(({ icon: Icon, label, cmd }) => (
          <button
            key={cmd}
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={(e) => {
              e.preventDefault();
              exec(cmd);
              emit();
            }}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-[8px]',
              'text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.08]'
            )}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline
        aria-label="Rich text editor"
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onMouseUp={emit}
        onKeyUp={emit}
        className={cn(
          'custom-scrollbar prose-vani flex-1 overflow-auto px-6 py-5 focus-ring-token',
          'text-body leading-[1.65] text-foreground'
        )}
 />
    </div>
  );
}
