import type { ChatSummary } from '@/lib/types';

export type ChatGroupLabel = 'Today' | 'Yesterday' | 'Previous 7 Days' | 'Older';

export interface ChatGroup {
  label: ChatGroupLabel;
  chats: ChatSummary[];
}

const GROUP_ORDER: ChatGroupLabel[] = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function resolveGroupLabel(updatedAt: string | undefined, now: Date): ChatGroupLabel {
  const date = updatedAt ? new Date(updatedAt) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Older';

  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff <= 7) return 'Previous 7 Days';
  return 'Older';
}

/**
 * Groups chats into ChatGPT-style date buckets (Today / Yesterday / Previous
 * 7 Days / Older). Input is expected to already be sorted by `updatedAt`
 * descending (the API guarantees this); grouping preserves that order within
 * each bucket. Empty buckets are omitted.
 */
export function groupChatsByDate(chats: ChatSummary[], now: Date = new Date()): ChatGroup[] {
  const buckets = new Map<ChatGroupLabel, ChatSummary[]>();

  for (const chat of chats) {
    const label = resolveGroupLabel(chat.updatedAt, now);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(chat);
  }

  return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => ({
    label,
    chats: buckets.get(label)!,
  }));
}
