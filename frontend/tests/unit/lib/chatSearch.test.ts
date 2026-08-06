import { describe, it, expect } from "vitest";
import { matchesChatQuery, filterChatsByQuery } from "@/lib/chatSearch";
import type { ChatSummary } from "@/lib/types";

function chat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return { id: "1", title: "Untitled", ...overrides };
}

describe("matchesChatQuery", () => {
  it("matches any chat for an empty/whitespace query", () => {
    expect(matchesChatQuery(chat({ title: "Anything" }), "")).toBe(true);
    expect(matchesChatQuery(chat({ title: "Anything" }), "   ")).toBe(true);
  });

  it("matches case-insensitively against the title", () => {
    expect(matchesChatQuery(chat({ title: "Deploying to Production" }), "DEPLOY")).toBe(true);
    expect(matchesChatQuery(chat({ title: "Deploying to Production" }), "banana")).toBe(false);
  });

  it("matches against the last-message preview when present", () => {
    const c = chat({ title: "Chat", lastMessage: "Let's discuss the Q3 roadmap" });
    expect(matchesChatQuery(c, "roadmap")).toBe(true);
  });

  it("does not throw when lastMessage is absent", () => {
    expect(matchesChatQuery(chat({ title: "Chat", lastMessage: undefined }), "roadmap")).toBe(false);
  });
});

describe("filterChatsByQuery", () => {
  const chats = [
    chat({ id: "1", title: "Recipe ideas" }),
    chat({ id: "2", title: "Trip to Japan", lastMessage: "Book flights" }),
    chat({ id: "3", title: "Budget review" }),
  ];

  it("returns all chats unchanged for an empty query", () => {
    expect(filterChatsByQuery(chats, "")).toEqual(chats);
  });

  it("filters down to matching chats", () => {
    const result = filterChatsByQuery(chats, "japan");
    expect(result.map((c) => c.id)).toEqual(["2"]);
  });

  it("matches via lastMessage content too", () => {
    const result = filterChatsByQuery(chats, "flights");
    expect(result.map((c) => c.id)).toEqual(["2"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterChatsByQuery(chats, "nonexistent")).toEqual([]);
  });
});
