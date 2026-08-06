import type { ChatSummary } from '@/lib/types';

/**
 * True when `chat` matches `query` — case-insensitive substring match
 * against the title and (if present) the last-message preview. Mirrors the
 * backend's `$or: [{ title }, { lastMessage }]` regex search so client-side
 * instant filtering and the debounced server search stay in agreement.
 */
export function matchesChatQuery(chat: ChatSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    chat.title.toLowerCase().includes(q) ||
    (chat.lastMessage?.toLowerCase().includes(q) ?? false)
  );
}

/** Filters `chats` down to those matching `query`. Empty query is a no-op. */
export function filterChatsByQuery(chats: ChatSummary[], query: string): ChatSummary[] {
  if (!query.trim()) return chats;
  return chats.filter((chat) => matchesChatQuery(chat, query));
}
