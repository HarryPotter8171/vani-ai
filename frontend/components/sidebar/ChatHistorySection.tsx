'use client';

import React, { memo, useEffect, useMemo, useRef } from 'react';
import { MessageSquareText } from 'lucide-react';
import { groupChatsByDate } from '@/lib/chatGroups';
import ChatHistoryItem from '@/components/sidebar/ChatHistoryItem';
import type { ChatSummary } from '@/lib/types';
import { useInView } from 'framer-motion';
import { Skeleton } from '@/components/ui/Skeleton';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { ErrorState } from '@/components/ui/ErrorState';
import { Spinner } from '@/components/ui/Spinner';

export interface ChatHistorySectionProps {
  chats: ChatSummary[];
  isLoading: boolean;
  error?: string | null;
  /** Current search query — used to highlight matching titles and drive the empty state copy. */
  query: string;
  activeChatId?: string | null;
  onSelectChat: (chatId: string) => void;
  onRenameChat?: (chatId: string, newTitle: string) => void;
  onDeleteChat?: (chatId: string) => void;
  onPinChat?: (chatId: string, pinned: boolean) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

function SkeletonRow({ width = '100%' }: { width?: string }) {
  return <Skeleton className="h-8 w-full" rounded="md" style={{ width }} />;
}

function ChatHistorySection({
  chats,
  isLoading,
  error,
  query,
  activeChatId = null,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onPinChat,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: ChatHistorySectionProps) {
  // Pinned chats get their own section above the date groups (which keep
  // their existing chronological sorting/grouping, untouched, for
  // everything else). `chats` already arrives pinned-first from the API /
  // optimistic-update sort, so this split alone is enough to guarantee
  // pinned rows always render at the top.
  const pinnedChats = useMemo(() => chats.filter((c) => c.pinned), [chats]);
  const unpinnedChats = useMemo(() => chats.filter((c) => !c.pinned), [chats]);
  const groups = useMemo(() => groupChatsByDate(unpinnedChats), [unpinnedChats]);
  const showSkeleton = isLoading && chats.length === 0;
  const showEmpty = !isLoading && !error && chats.length === 0;

  const sentinelRef = useRef<HTMLDivElement>(null);
  const sentinelInView = useInView(sentinelRef, { margin: '200px 0px 0px 0px' });

  useEffect(() => {
    if (sentinelInView && hasMore && !isLoadingMore) onLoadMore?.();
  }, [sentinelInView, hasMore, isLoadingMore, onLoadMore]);

  return (
    <section>
      <div className="mb-2 px-3.5 text-micro font-semibold uppercase tracking-[0.08em] text-muted-foreground/40">
        Chats
      </div>

      {showSkeleton && (
        <div className="space-y-1.5 px-1" aria-busy="true" aria-label="Loading chats">
          {['92%', '78%', '88%', '64%', '84%', '70%'].map((w, i) => (
            <SkeletonRow key={i} width={w} />
          ))}
        </div>
      )}

      {!!error && !showSkeleton && (
        <ErrorState
          compact
          title="Couldn’t load chats"
          message={error}
          className="px-2"
 />
      )}

      {showEmpty && (
        <PremiumEmpty
          size="sm"
          icon={MessageSquareText}
          title={query.trim() ? 'No matches' : 'No conversations yet'}
          description={
            query.trim()
              ? `Nothing matches “${query.trim()}”.`
              : 'Start a new chat to see it here.'
          }
 />
      )}

      {!showSkeleton && !showEmpty && (
        <div className="space-y-4">
          {!!pinnedChats.length && (
            <div>
              <div className="os-section-label mb-1.5 px-3.5">Pinned</div>
              <div className="space-y-0.5">
                {pinnedChats.map((chat) => (
                  <ChatHistoryItem
                    key={chat.id}
                    chat={chat}
                    query={query}
                    isActive={activeChatId === chat.id}
                    onSelect={onSelectChat}
                    onRename={onRenameChat}
                    onDelete={onDeleteChat}
                    onPin={onPinChat}
 />
                ))}
              </div>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.label}>
              <div className="os-section-label mb-1.5 px-3.5">{group.label}</div>
              <div className="space-y-0.5">
                {group.chats.map((chat) => (
                  <ChatHistoryItem
                    key={chat.id}
                    chat={chat}
                    query={query}
                    isActive={activeChatId === chat.id}
                    onSelect={onSelectChat}
                    onRename={onRenameChat}
                    onDelete={onDeleteChat}
                    onPin={onPinChat}
 />
                ))}
              </div>
            </div>
          ))}

          {/* Infinite-scroll sentinel — becomes active once the API supports
              cursor/offset pagination (see useChatHistory). */}
          <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
          {isLoadingMore && (
            <div className="flex items-center justify-center gap-2 py-3 text-caption text-text-tertiary">
              <Spinner size={14} label="Loading more" />
              <span>Loading more…</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default memo(ChatHistorySection);
