'use client';

import React, { forwardRef, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/types';

export interface MobileChatContainerProps {
  messages: Message[];
  chatId: string | null;
  isLoading: boolean;
  isChatLoading: boolean;
  composerHeight: number;
  workspaceBarHeight?: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * MobileChatContainer - Single-column mobile chat layout
 * 
 * Features:
 * - Full-width message display
 * - Comfortable horizontal padding (16px)
 * - Proper vertical spacing
 * - Auto-scroll to bottom
 * - Composer height awareness
 * - Safe area support
 */
const MobileChatContainer = forwardRef<HTMLDivElement, MobileChatContainerProps>(
  function MobileChatContainer(
    {
      messages,
      chatId,
      isLoading,
      isChatLoading,
      composerHeight,
      workspaceBarHeight = 0,
      children,
      className,
    },
    ref
  ) {
    const internalRef = useRef<HTMLDivElement>(null);
    const scrollRef = (ref as React.RefObject<HTMLDivElement>) || internalRef;

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
      const container = scrollRef.current;
      if (!container) return;

      // Only auto-scroll if user is near bottom
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }, [messages.length, scrollRef]);

    return (
      <div
        ref={scrollRef}
        className={cn(
          'flex-1 overflow-y-auto',
          'custom-scrollbar',
          'bg-background',
          // Safe area support
          'safe-area-bottom',
          className
        )}
        style={{
          // Account for header, workspace bar, and composer
          paddingTop: `calc(48px + env(safe-area-inset-top, 0px) + ${workspaceBarHeight}px)`,
          paddingBottom: `${composerHeight + 20}px`,
        }}
      >
        <div className={cn(
          'w-full',
          'px-4', // 16px horizontal padding for comfortable reading
          'py-4'
        )}>
          {children}
        </div>
      </div>
    );
  }
);

export default MobileChatContainer;