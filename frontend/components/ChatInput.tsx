'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Mic, Send, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
}

export default function ChatInput({ onSendMessage, isLoading }: ChatInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input);
    setInput('');
  };

  const canSend = input.trim().length > 0 && !isLoading;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-5 pb-6 md:px-8 md:pb-8">
      {/* Soft fade behind input */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/90 to-transparent" />

      <form
        onSubmit={handleSubmit}
        className={cn(
          'pointer-events-auto relative flex w-full max-w-[680px] items-center gap-1',
          'glass-input px-4 py-3 md:px-5 md:py-3.5'
        )}
      >
        <button
          type="button"
          className={cn(
            'hover-lift flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            'text-muted-foreground hover:bg-foreground/[0.05] dark:hover:bg-white/[0.06] hover:text-foreground'
          )}
          aria-label="Attach file"
        >
          <Paperclip size={18} strokeWidth={1.75} />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message VANI AI..."
          disabled={isLoading}
          className={cn(
            'min-w-0 flex-1 bg-transparent px-2 text-[15px] tracking-[-0.01em] text-foreground outline-none',
            'placeholder:text-muted-foreground/45',
            'disabled:opacity-50'
          )}
        />

        <button
          type="button"
          className={cn(
            'hover-lift flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            'text-muted-foreground hover:bg-foreground/[0.05] dark:hover:bg-white/[0.06] hover:text-foreground'
          )}
          aria-label="Voice input"
        >
          <Mic size={18} strokeWidth={1.75} />
        </button>

        <button
          type="submit"
          disabled={!canSend}
          className={cn(
            'hover-lift flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300',
            canSend
              ? 'bg-primary text-white shadow-[0_2px_16px_var(--primary-glow)] hover:shadow-[0_4px_24px_var(--primary-glow)]'
              : 'bg-foreground/[0.05] text-muted-foreground/50 cursor-not-allowed dark:bg-white/[0.06]'
          )}
          aria-label={isLoading ? 'Generating' : 'Send message'}
        >
          {isLoading ? (
            <Square size={13} strokeWidth={2.5} fill="currentColor" />
          ) : (
            <Send size={16} strokeWidth={2} />
          )}
        </button>
      </form>
    </div>
  );
}
