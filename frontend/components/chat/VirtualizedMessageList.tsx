'use client';

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import Message from '@/components/Message';
import type { Artifact } from '@/lib/artifacts';
import type { Message as ChatMessage } from '@/lib/types';
import type { TtsState } from '@/components/chat/MessageActions';

/** Below this count, mount every row (short threads stay simple). */
const VIRTUALIZE_AFTER = 40;
const ESTIMATED_ROW_PX = 128;
const OVERSCAN_PX = 900;

export interface VirtualizedMessageListProps {
  messages: ChatMessage[];
  /** Changes when the active conversation changes — resets measured row heights. */
  threadKey?: string;
  scrollParentRef: React.RefObject<HTMLElement | null>;
  activeArtifactId?: string | null;
  onOpenArtifact: (id: string) => void;
  onArtifactsDetected: (messageId: string, artifacts: Artifact[]) => void;
  onForgetMemory?: (content: string) => void;
  onRegenerate?: (messageId: string) => void;
  onContinue?: (messageId: string) => void;
  regenerateDisabled?: boolean;
  ttsMessageId?: string | null;
  ttsState?: TtsState;
  ttsParagraphIndex?: number;
  onReadAloud?: (messageId: string, content: string) => void;
  onPauseAloud?: () => void;
  onStopAloud?: () => void;
}

type Row =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'skip' };

function buildRows(messages: ChatMessage[]): { rows: Row[]; messageIndexById: Map<string, number> } {
  const rows: Row[] = [];
  const messageIndexById = new Map<string, number>();
  for (const msg of messages) {
    // Empty streaming placeholder is represented by TypingIndicator instead.
    if (msg.role === 'assistant' && msg.isStreaming && msg.content === '') {
      continue;
    }
    messageIndexById.set(msg.id, rows.length);
    rows.push({ kind: 'message', message: msg });
  }
  return { rows, messageIndexById };
}

function offsetFor(heights: Map<number, number>, index: number) {
  let offset = 0;
  for (let i = 0; i < index; i++) {
    offset += heights.get(i) ?? ESTIMATED_ROW_PX;
  }
  return offset;
}

function VirtualizedMessageListInner({
  messages,
  threadKey,
  scrollParentRef,
  activeArtifactId,
  onOpenArtifact,
  onArtifactsDetected,
  onForgetMemory,
  onRegenerate,
  onContinue,
  regenerateDisabled,
  ttsMessageId,
  ttsState = 'idle',
  ttsParagraphIndex = -1,
  onReadAloud,
  onPauseAloud,
  onStopAloud,
}: VirtualizedMessageListProps) {
  const { rows } = useMemo(() => buildRows(messages), [messages]);
  const [heights, setHeights] = useState<Map<number, number>>(() => new Map());
  const [windowRange, setWindowRange] = useState({ start: 0, end: rows.length });

  const shouldVirtualize = rows.length > VIRTUALIZE_AFTER;

  // Stale height maps from a previous thread cause padTop/padBottom drift and
  // scroll jumps when switching conversations or regenerating.
  useEffect(() => {
    setHeights(new Map());
    setWindowRange({ start: 0, end: rows.length });
  }, [threadKey]); // eslint-disable-line react-hooks/exhaustive-deps -- only on thread change

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'assistant') return messages[i].id;
    }
    return null;
  }, [messages]);

  const totalHeight = useMemo(() => {
    let h = 0;
    for (let i = 0; i < rows.length; i++) {
      h += heights.get(i) ?? ESTIMATED_ROW_PX;
    }
    return h;
  }, [rows.length, heights]);

  const recomputeWindow = useCallback(() => {
    if (!shouldVirtualize) {
      setWindowRange({ start: 0, end: rows.length });
      return;
    }
    const parent = scrollParentRef.current;
    if (!parent) {
      setWindowRange({ start: 0, end: Math.min(rows.length, 60) });
      return;
    }

    const scrollTop = parent.scrollTop;
    const viewH = parent.clientHeight;
    const top = Math.max(0, scrollTop - OVERSCAN_PX);
    const bottom = scrollTop + viewH + OVERSCAN_PX;

    let start = 0;
    let acc = 0;
    while (start < rows.length && acc + (heights.get(start) ?? ESTIMATED_ROW_PX) < top) {
      acc += heights.get(start) ?? ESTIMATED_ROW_PX;
      start += 1;
    }

    let end = start;
    while (end < rows.length && acc < bottom) {
      acc += heights.get(end) ?? ESTIMATED_ROW_PX;
      end += 1;
    }

    setWindowRange((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end }
    );
  }, [heights, rows.length, scrollParentRef, shouldVirtualize]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      recomputeWindow();
    });
    return () => cancelAnimationFrame(id);
  }, [recomputeWindow, rows.length, totalHeight]);

  useEffect(() => {
    const parent = scrollParentRef.current;
    if (!parent || !shouldVirtualize) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        recomputeWindow();
      });
    };

    parent.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      parent.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [recomputeWindow, scrollParentRef, shouldVirtualize]);

  const setRowEl = useCallback((index: number, el: HTMLDivElement | null) => {
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    setHeights((prev) => {
      const existing = prev.get(index);
      if (existing !== undefined && Math.abs(existing - h) < 1) return prev;
      const next = new Map(prev);
      next.set(index, h);
      return next;
    });
  }, []);

  const renderMessage = (msg: ChatMessage) => (
    <Message
      id={msg.id}
      role={msg.role}
      content={msg.content}
      isStreaming={msg.isStreaming}
      wasInterrupted={msg.wasInterrupted}
      attachments={msg.attachments}
      meta={msg.meta}
      usage={msg.usage}
      activeArtifactId={activeArtifactId}
      onOpenArtifact={onOpenArtifact}
      onArtifactsDetected={onArtifactsDetected}
      onForgetMemory={onForgetMemory}
      onRegenerate={
        onRegenerate && msg.id === lastAssistantId
          ? onRegenerate
          : undefined
      }
      onContinue={onContinue}
      regenerateDisabled={regenerateDisabled}
      ttsState={ttsMessageId === msg.id ? ttsState : 'idle'}
      ttsParagraphIndex={ttsMessageId === msg.id ? ttsParagraphIndex : -1}
      onReadAloud={onReadAloud}
      onPauseAloud={onPauseAloud}
      onStopAloud={onStopAloud}
    />
  );

  if (!shouldVirtualize) {
    return (
      <div className="flex flex-col">
        {rows.map((row, index) => {
          if (row.kind !== 'message') return null;
          const msg = row.message;
          return (
            <div
              key={msg.id}
              ref={(el) => setRowEl(index, el)}
              className="[content-visibility:auto] [contain-intrinsic-size:auto_96px]"
            >
              {renderMessage(msg)}
            </div>
          );
        })}
      </div>
    );
  }

  const start = windowRange.start;
  const end = windowRange.end;
  const padTop = offsetFor(heights, start);
  const padBottom = Math.max(0, totalHeight - offsetFor(heights, end));

  return (
    <div className="flex flex-col" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
      {rows.slice(start, end).map((row, i) => {
        const index = start + i;
        if (row.kind !== 'message') return null;
        const msg = row.message;
        return (
          <div
            key={msg.id}
            ref={(el) => setRowEl(index, el)}
            className="[content-visibility:auto] [contain-intrinsic-size:auto_96px]"
          >
            {renderMessage(msg)}
          </div>
        );
      })}
    </div>
  );
}

const VirtualizedMessageList = memo(VirtualizedMessageListInner);
export default VirtualizedMessageList;
