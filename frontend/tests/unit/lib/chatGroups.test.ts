import { describe, it, expect } from "vitest";
import { groupChatsByDate } from "@/lib/chatGroups";
import type { ChatSummary } from "@/lib/types";

function chat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: overrides.id || Math.random().toString(36).slice(2),
    title: "Chat",
    updatedAt: new Date().toISOString(),
    pinned: false,
    ...overrides,
  } as ChatSummary;
}

describe("groupChatsByDate", () => {
  const now = new Date("2026-08-03T12:00:00Z");

  it("buckets a chat updated today as 'Today'", () => {
    const groups = groupChatsByDate([chat({ id: "a", updatedAt: now.toISOString() })], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].chats).toHaveLength(1);
  });

  it("buckets a chat updated yesterday as 'Yesterday'", () => {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const groups = groupChatsByDate([chat({ id: "a", updatedAt: yesterday.toISOString() })], now);
    expect(groups[0].label).toBe("Yesterday");
  });

  it("buckets a chat from 3 days ago as 'Previous 7 Days'", () => {
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const groups = groupChatsByDate([chat({ id: "a", updatedAt: threeDaysAgo.toISOString() })], now);
    expect(groups[0].label).toBe("Previous 7 Days");
  });

  it("buckets a chat from 30 days ago as 'Older'", () => {
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const groups = groupChatsByDate([chat({ id: "a", updatedAt: monthAgo.toISOString() })], now);
    expect(groups[0].label).toBe("Older");
  });

  it("treats a missing or invalid updatedAt as 'Older'", () => {
    const groups = groupChatsByDate([chat({ id: "a", updatedAt: undefined })], now);
    expect(groups[0].label).toBe("Older");

    const invalid = groupChatsByDate([chat({ id: "b", updatedAt: "not-a-date" })], now);
    expect(invalid[0].label).toBe("Older");
  });

  it("orders groups Today -> Yesterday -> Previous 7 Days -> Older and omits empty buckets", () => {
    const chats = [
      chat({ id: "old", updatedAt: new Date(now.getTime() - 30 * 86_400_000).toISOString() }),
      chat({ id: "today", updatedAt: now.toISOString() }),
      chat({ id: "week", updatedAt: new Date(now.getTime() - 3 * 86_400_000).toISOString() }),
    ];
    const groups = groupChatsByDate(chats, now);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Previous 7 Days", "Older"]);
  });

  it("preserves input order within a bucket", () => {
    const chats = [
      chat({ id: "first", updatedAt: now.toISOString() }),
      chat({ id: "second", updatedAt: new Date(now.getTime() - 1000).toISOString() }),
    ];
    const groups = groupChatsByDate(chats, now);
    expect(groups[0].chats.map((c) => c.id)).toEqual(["first", "second"]);
  });

  it("returns an empty array for no chats", () => {
    expect(groupChatsByDate([], now)).toEqual([]);
  });
});
