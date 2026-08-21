'use client';

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Mic, ArrowUp, Square, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import type { MessageAttachment, AgentTypeInfo } from '@/lib/types';

export interface MobileComposerHandle {
  focus: () => void;
}

export interface MobileComposerProps {
  onSendMessage: (message: string, attachments?: MessageAttachment[]) => void;
  isLoading?: boolean;
  onStopGenerating?: () => void;
  onOpenVoiceMode?: () => void;
  onHeightChange?: (height: number) => void;
  agents?: AgentTypeInfo[];
  selectedAgent?: string | null;
  onSelectAgent?: (id: string | null) => void;
  webSearchEnabled?: boolean;
  deepResearchEnabled?: boolean;
  onToggleWebSearch?: (value: boolean) => void;
  onToggleDeepResearch?: (value: boolean) => void;
  selectedModel?: string;
  onSelectModel?: (modelKey: string) => void;
  projectDefaultModel?: string | null;
}

const MAX_TEXTAREA_HEIGHT = 120;
const MIN_TEXTAREA_HEIGHT = 24;

/**
 * MobileComposer - App-like mobile composer with keyboard support
 * 
 * Features:
 * - Fixed at bottom with safe area support
 * - Keyboard-aware positioning
 * - Expands vertically for longer messages
 * - Touch-friendly buttons (44x44 minimum)
 * - Microphone button accessible
 * - Attachment button accessible
 * - Send button clearly visible
 * - Never causes horizontal overflow
 */
const MobileComposer = forwardRef<MobileComposerHandle, MobileComposerProps>(
  function MobileComposer(
    {
      onSendMessage,
      isLoading,
      onStopGenerating,
      onOpenVoiceMode,
      onHeightChange,
      agents,
      selectedAgent,
      onSelectAgent,
      webSearchEnabled,
      deepResearchEnabled,
      onToggleWebSearch,
      onToggleDeepResearch,
      selectedModel,
      onSelectModel,
      projectDefaultModel,
    },
    ref
  ) {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const { keyboardInset } = useVisualViewport();

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          textareaRef.current?.focus();
        },
      }),
      []
    );

    const resizeTextarea = useCallback(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT)}px`;
    }, []);

    useEffect(() => {
      resizeTextarea();
    }, [input, resizeTextarea]);

    // Report height changes to parent
    useEffect(() => {
      const el = rootRef.current;
      if (!el || !onHeightChange) return;

      const report = () => onHeightChange(el.getBoundingClientRect().height);
      report();

      const ro = new ResizeObserver(report);
      ro.observe(el);
      return () => ro.disconnect();
    }, [onHeightChange]);

    const submit = () => {
      if (isLoading || !input.trim()) return;
      onSendMessage(input.trim());
      setInput('');
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
          textareaRef.current.focus();
        }
      });
    };

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (isLoading) {
        onStopGenerating?.();
        return;
      }
      submit();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    };

    const canSend = input.trim().length > 0 && !isLoading;

    return (
      <div
        ref={rootRef}
        className={cn(
          'fixed left-0 right-0 bottom-0 z-40',
          'bg-background/95 backdrop-blur-xl',
          'border-t border-border/50',
          'transition-all duration-200 ease-out'
        )}
        style={{
          bottom: keyboardInset > 0 ? keyboardInset : 0,
          paddingBottom: `max(12px, env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <div className="px-4 py-3">
          <form
            onSubmit={handleSubmit}
            className={cn(
              'flex items-end gap-2',
              'bg-surface-input',
              'rounded-full',
              'border border-border/70',
              'shadow-sm',
              'transition-all',
              'focus-within:ring-2 focus-within:ring-accent/50'
            )}
          >
            {/* Plus Button */}
            <button
              type="button"
              className={cn(
                'flex items-center justify-center',
                'h-11 w-11 shrink-0',
                'rounded-full',
                'text-muted-foreground',
                'transition-colors',
                'hover:bg-surface-hover hover:text-foreground',
                'active:scale-95',
                'touch-manipulation'
              )}
              aria-label="Add attachment"
            >
              <Plus size={20} strokeWidth={1.75} />
            </button>

            {/* Text Input */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask VANI..."
              disabled={isLoading}
              rows={1}
              aria-label="Message input"
              className={cn(
                'flex-1 min-w-0 bg-transparent',
                'py-2.5 text-base leading-[1.5] tracking-[-0.014em]',
                'text-foreground',
                'placeholder:text-muted-foreground/50',
                'outline-none border-none resize-none',
                'custom-scrollbar overflow-y-auto',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
              style={{ height: MIN_TEXTAREA_HEIGHT, maxHeight: MAX_TEXTAREA_HEIGHT }}
            />

            {/* Voice Button */}
            {onOpenVoiceMode && (
              <button
                type="button"
                onClick={onOpenVoiceMode}
                disabled={isLoading}
                className={cn(
                  'flex items-center justify-center',
                  'h-11 w-11 shrink-0',
                  'rounded-full',
                  'text-muted-foreground',
                  'transition-colors',
                  'hover:bg-surface-hover hover:text-foreground',
                  'active:scale-95',
                  'touch-manipulation',
                  'disabled:opacity-40'
                )}
                aria-label="Voice mode"
              >
                <Mic size={20} strokeWidth={1.75} />
              </button>
            )}

            {/* Send Button */}
            <button
              type="submit"
              disabled={!canSend && !isLoading}
              className={cn(
                'flex items-center justify-center',
                'h-11 w-11 shrink-0',
                'rounded-full',
                'transition-all',
                'touch-manipulation',
                canSend
                  ? 'bg-accent text-text-on-accent shadow-md hover:bg-accent-hover'
                  : isLoading
                    ? 'bg-accent/85 text-text-on-accent'
                    : 'bg-surface-hover text-muted-foreground opacity-50'
              )}
              aria-label={isLoading ? 'Stop generating' : 'Send message'}
            >
              {isLoading ? (
                <Square size={18} strokeWidth={1.75} />
              ) : (
                <ArrowUp size={18} strokeWidth={1.75} />
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }
);

export default MobileComposer;