'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { filterChatsByQuery } from '@/lib/chatSearch';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { ChatSummary } from '@/lib/types';

interface RawChatSummary {
  _id: string;
  title: string;
  lastMessage?: string;
  updatedAt?: string;
  project?: string | null;
  pinned?: boolean;
}

function mapChat(raw: RawChatSummary): ChatSummary {
  return {
    id: raw._id,
    title: raw.title || 'New Chat',
    lastMessage: raw.lastMessage,
    updatedAt: raw.updatedAt,
    project: raw.project ?? null,
    pinned: raw.pinned ?? false,
  };
}

// Mirrors the backend's `.sort({ pinned: -1, updatedAt: -1 })` — pinned
// chats first, chronological order unchanged otherwise. Applied to local
// optimistic mutations so the list never looks out of order between a
// pin/unpin action and the next full refetch.
function sortChats(chats: ChatSummary[]): ChatSummary[] {
  return [...chats].sort((a, b) => {
    const pinnedDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    if (pinnedDiff !== 0) return pinnedDiff;
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });
}

/**
 * Fetches and manages the current user's personal (non-project) chat
 * history — the data source for the sidebar's conversation list.
 *
 * Reads `GET /api/chat/list` and exposes rename/delete/pin mutations, each
 * paired with an optimistic local-state update (and rollback on failure)
 * so the sidebar reacts instantly without waiting on a round trip.
 */
export function useChatHistory() {
  // `serverChats` is whatever the last resolved `/chat/list` request
  // returned. `query` is the raw, un-debounced search box value.
  const [serverChats, setServerChats] = useState<ChatSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // The network request is debounced (throttles calls while typing); the
  // rendered list is *not* — it's instantly re-filtered client-side against
  // whatever's already loaded, then refined again once the debounced,
  // authoritative server search resolves. This is what gives conversation
  // search both "instant" (zero-latency, client-side) and "debounced"
  // (throttled network) behavior at once.
  const debouncedQuery = useDebouncedValue(query, 250);

  // Guards against out-of-order responses (e.g. a slow earlier search
  // request resolving after a faster, more recent one).
  const requestIdRef = useRef(0);

  const refresh = useCallback(async (q?: string) => {
    const effectiveQuery = q ?? debouncedQuery;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (effectiveQuery.trim()) params.set('q', effectiveQuery.trim());

      const path = params.toString() ? `/chat/list?${params.toString()}` : '/chat/list';
      const response = await apiFetch(path);
      if (!response.ok) throw new Error('Unable to load conversations');

      const data: RawChatSummary[] = await response.json();
      if (requestId !== requestIdRef.current) return; // stale response

      setServerChats(data.map(mapChat));
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError((err as Error).message || 'Unable to load conversations');
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [debouncedQuery]);

  // Fetches immediately on mount; re-fetches whenever the debounced query
  // settles (i.e. the user has paused typing for 250ms).
  const isFirstRunRef = useRef(true);
  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      void refresh(debouncedQuery);
      return;
    }
    void refresh(debouncedQuery);
  }, [debouncedQuery, refresh]);

  const search = useCallback((q: string) => setQuery(q), []);

  // Instant client-side filter, applied on every keystroke against
  // whatever's currently loaded — no network round trip required for the
  // list to visibly react. `filterChatsByQuery` mirrors the backend's
  // title/lastMessage matching, so once the debounced fetch above resolves
  // for the settled query, this filter is effectively a no-op pass-through.
  const chats = useMemo(() => filterChatsByQuery(serverChats, query), [serverChats, query]);

  // POST /api/chat/new — creates a fresh, empty chat server-side. Kept as a
  // thin wrapper (no local state mutation) so callers can drive their own
  // optimistic-UI sequencing with addOptimisticChat/replaceChat/removeChat.
  const createChat = useCallback(
    async (options?: { projectId?: string | null; title?: string }) => {
      const response = await apiFetch('/chat/new', {
        method: 'POST',
        body: JSON.stringify({
          projectId: options?.projectId || undefined,
          title: options?.title,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to create chat');
      }

      const data: RawChatSummary = await response.json();
      return mapChat(data);
    },
    []
  );

  // Optimistic-UI helpers: pure local list mutations, no network calls.
  // `addOptimisticChat` inserts a placeholder before the server call
  // resolves (re-sorted so it still lands below any pinned chats);
  // `replaceChat` swaps it for the real record on success; `removeChat`
  // rolls it back on failure.
  const addOptimisticChat = useCallback((chat: ChatSummary) => {
    setServerChats((prev) => sortChats([chat, ...prev]));
  }, []);

  const replaceChat = useCallback((tempId: string, chat: ChatSummary) => {
    setServerChats((prev) => sortChats(prev.map((c) => (c.id === tempId ? chat : c))));
  }, []);

  const removeChat = useCallback((id: string) => {
    setServerChats((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Rollback helper for optimistic delete — reinserts a chat at its exact
  // original index (rather than prepending to the top), then re-sorts, so
  // both the date grouping and pinned-first ordering it belonged to look
  // correct again.
  const insertChatAt = useCallback((index: number, chat: ChatSummary) => {
    setServerChats((prev) => {
      const next = [...prev];
      const safeIndex = Math.min(Math.max(index, 0), next.length);
      next.splice(safeIndex, 0, chat);
      return sortChats(next);
    });
  }, []);

  // DELETE /api/chat/:id — the actual server-side deletion. Callers drive
  // their own optimistic removal (via `removeChat`) and rollback (via
  // `insertChatAt`) around this call.
  const deleteChatOnServer = useCallback(async (chatId: string): Promise<void> => {
    const response = await apiFetch(`/chat/${chatId}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Unable to delete chat');
    }
  }, []);

  // Local-only patch — no network call. Used both for optimistic rename
  // (applied before the PATCH resolves, reverted on failure) and to reflect
  // an auto-generated title once it's confirmed saved. Lets the sidebar
  // update instantly without a full list refetch.
  const updateChatTitle = useCallback((id: string, title: string) => {
    setServerChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }, []);

  // POST /api/chat/:id/generate-title — asks the backend to generate a short
  // title from the first user message. Read-only: it does NOT persist
  // anything. Returns the generated title, or `null` when the chat already
  // has a real title (nothing to save — caller should skip the PATCH).
  const generateTitle = useCallback(async (chatId: string, message: string): Promise<string | null> => {
    const response = await apiFetch(`/chat/${chatId}/generate-title`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    if (!response.ok) throw new Error('Unable to generate title');

    const data: { title?: string; generated?: boolean } = await response.json();
    return data.generated && data.title ? data.title : null;
  }, []);

  // PATCH /api/chat/:id/title — the single, validated endpoint for
  // persisting a chat's title (used for both manual rename and
  // auto-generated titles).
  const saveTitle = useCallback(async (chatId: string, title: string): Promise<void> => {
    const response = await apiFetch(`/chat/${chatId}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Unable to save title');
    }
  }, []);

  // Local-only patch — no network call. Applied optimistically before the
  // pin/unpin request resolves (and reverted on failure); re-sorts so
  // pinned chats immediately float to the top.
  const updateChatPinned = useCallback((id: string, pinned: boolean) => {
    setServerChats((prev) => sortChats(prev.map((c) => (c.id === id ? { ...c, pinned } : c))));
  }, []);

  // POST /api/chat/:id/pin | /unpin — persists the pinned state.
  const setChatPinned = useCallback(async (chatId: string, pinned: boolean): Promise<void> => {
    const response = await apiFetch(`/chat/${chatId}/${pinned ? 'pin' : 'unpin'}`, {
      method: 'POST',
      body: JSON.stringify({ pinned }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Unable to ${pinned ? 'pin' : 'unpin'} chat`);
    }
  }, []);

  return {
    chats,
    isLoading,
    error,
    query,
    search,
    refresh,
    createChat,
    addOptimisticChat,
    replaceChat,
    removeChat,
    insertChatAt,
    deleteChatOnServer,
    updateChatTitle,
    generateTitle,
    saveTitle,
    updateChatPinned,
    setChatPinned,
    // Infinite-scroll-ready surface. GET /api/chat/list currently returns a
    // fixed, non-paginated page (no cursor/offset support server-side), so
    // there is nothing further to fetch yet — `hasMore` stays false and
    // `loadMore` is a no-op until the API grows pagination support. The
    // sidebar already wires up the scroll sentinel against this contract so
    // enabling real pagination later is a hook-only change.
    hasMore: false,
    isLoadingMore: false,
    loadMore: () => {},
  };
}
